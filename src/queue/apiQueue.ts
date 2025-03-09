// src/queue/apiQueue.ts
import { Logger } from 'homebridge';
import { Client, DeviceStatus } from '../sleepme/client';
import ReadThroughCache from '../readThroughCache';

export type QueueItemType = 'temperature' | 'state';

export interface QueueItem {
  id: string;
  type: QueueItemType;
  value: any;
  timestamp: number;
}

export type QueueItemKey = `${string}:${QueueItemType}`;

// Track the last set values for each device
export interface DeviceDesiredState {
  targetTemperatureC?: number;
  targetState?: 'standby' | 'active';
  lastModified: number;
  verificationTimerId?: NodeJS.Timeout;
}

export class ApiQueue {
  private queue: Map<QueueItemKey, QueueItem> = new Map();
  private processing = false;
  private lastProcessTime = 0;
  
  // Track desired state per device
  private deviceStates: Map<string, DeviceDesiredState> = new Map();
  
  // Caches for device status
  private cachesById: Map<string, ReadThroughCache> = new Map();

  constructor(
    private readonly client: Client,
    private readonly logger: Logger,
    private readonly intervalMs = 2000, // Default: process one request every 2 seconds
    private readonly maxRetries = 3,
    private readonly verificationDelayMs = 30000, // 30 seconds before verification
  ) {}

  /**
   * Register a cache for a specific device ID
   */
  public registerCache(deviceId: string, cache: ReadThroughCache): void {
    this.cachesById.set(deviceId, cache);
  }

  /**
   * Add a request to the queue. If a request with same device ID and type already exists,
   * it will be replaced with the newer request.
   */
  public enqueue(deviceId: string, type: QueueItemType, value: any): void {
    const key: QueueItemKey = `${deviceId}:${type}`;
    
    const queueItem: QueueItem = {
      id: deviceId,
      type,
      value,
      timestamp: Date.now(),
    };

    if (this.queue.has(key)) {
      this.logger.debug(`Replacing queued request for ${key}`);
    }
    
    this.queue.set(key, queueItem);
    this.logger.debug(`Queued ${type} update for device ${deviceId}: ${value}`);
    
    // Update the desired state for this device
    this.updateDesiredState(deviceId, type, value);
    
    // Schedule verification after delay
    this.scheduleVerification(deviceId);
    
    // Start processing if it's not already running
    if (!this.processing) {
      this.processQueue();
    }
  }
  
  /**
   * Update the desired state tracking for a device
   */
  private updateDesiredState(deviceId: string, type: QueueItemType, value: any): void {
    // Get or create device state
    const state = this.deviceStates.get(deviceId) || {
      lastModified: Date.now()
    };
    
    // Update the specific property
    if (type === 'temperature') {
      state.targetTemperatureC = value;
    } else if (type === 'state') {
      state.targetState = value === 0 ? 'standby' : 'active';
    }
    
    state.lastModified = Date.now();
    this.deviceStates.set(deviceId, state);
  }
  
  /**
   * Schedule a verification check after the configured delay
   */
  private scheduleVerification(deviceId: string): void {
    const state = this.deviceStates.get(deviceId);
    if (!state) return;
    
    // Clear any existing timer
    if (state.verificationTimerId) {
      clearTimeout(state.verificationTimerId);
    }
    
    // Set a new timer
    state.verificationTimerId = setTimeout(() => {
      this.verifyDeviceState(deviceId);
    }, this.verificationDelayMs);
  }

  /**
   * Process the queue, respecting the configured interval between requests
   */
  private async processQueue(): Promise<void> {
    if (this.queue.size === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    
    // Respect the interval between requests
    const now = Date.now();
    const timeToWait = Math.max(0, this.intervalMs - (now - this.lastProcessTime));
    
    if (timeToWait > 0) {
      await new Promise(resolve => setTimeout(resolve, timeToWait));
    }

    // Get the oldest request from the queue
    const oldestItem = this.getOldestItem();
    if (!oldestItem) {
      this.processing = false;
      return;
    }

    const key: QueueItemKey = `${oldestItem.id}:${oldestItem.type}`;
    this.queue.delete(key);
    
    try {
      await this.sendRequest(oldestItem);
      this.lastProcessTime = Date.now();
    } catch (error) {
      this.logger.error(`Error processing request for ${key}: ${error}`);
    }
    
    // Continue processing the queue
    setImmediate(() => this.processQueue());
  }

  /**
   * Get the oldest item in the queue
   */
  private getOldestItem(): QueueItem | null {
    if (this.queue.size === 0) {
      return null;
    }
    
    let oldestItem: QueueItem | null = null;
    let oldestTimestamp = Infinity;
    
    for (const item of this.queue.values()) {
      if (item.timestamp < oldestTimestamp) {
        oldestTimestamp = item.timestamp;
        oldestItem = item;
      }
    }
    
    return oldestItem;
  }

  /**
   * Send the actual API request
   */
  private async sendRequest(item: QueueItem): Promise<void> {
    let retries = 0;
    let success = false;

    while (!success && retries < this.maxRetries) {
      try {
        this.logger.debug(`Processing ${item.type} update for device ${item.id}: ${item.value}`);
        
        if (item.type === 'temperature') {
          // Assuming the value is in Celsius, as in the original code
          const tempF = Math.floor((item.value * (9 / 5)) + 32);
          await this.client.setTemperatureFahrenheit(item.id, tempF);
          this.logger.info(`Set temperature for device ${item.id} to ${tempF}°F (${item.value}°C)`);
        } else if (item.type === 'state') {
          const targetState = (item.value === 0) ? 'standby' : 'active';
          await this.client.setThermalControlStatus(item.id, targetState);
          this.logger.info(`Set thermal control status for device ${item.id} to ${targetState}`);
        }
        
        success = true;
      } catch (error) {
        retries++;
        this.logger.error(`API request failed (attempt ${retries}/${this.maxRetries}): ${error}`);
        
        if (retries < this.maxRetries) {
          // Exponential backoff
          const backoffMs = Math.min(1000 * Math.pow(2, retries), 10000);
          this.logger.debug(`Retrying in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    if (!success) {
      throw new Error(`Failed to process ${item.type} update for device ${item.id} after ${this.maxRetries} attempts`);
    }
  }
  
  /**
   * Verify that the device's actual state matches our desired state
   */
  private async verifyDeviceState(deviceId: string): Promise<void> {
    const desiredState = this.deviceStates.get(deviceId);
    if (!desiredState) return;
    
    // Clear the timer ID since we're running the verification now
    desiredState.verificationTimerId = undefined;
    
    // Get the cache for this device
    const cache = this.cachesById.get(deviceId);
    if (!cache) {
      this.logger.warn(`No cache registered for device ${deviceId}, skipping verification`);
      return;
    }
    
    try {
      // Force a fresh fetch of the device status
      const response = await cache.refresh();
      
      if (!response) {
        this.logger.warn(`Could not fetch current state for device ${deviceId}, verification failed`);
        return;
      }
      
      const actualState = response.data;
      let mismatch = false;
      
      // Check if temperature matches
      if (desiredState.targetTemperatureC !== undefined && 
          Math.abs(actualState.control.set_temperature_c - desiredState.targetTemperatureC) > 0.1) {
        this.logger.warn(
          `Temperature mismatch for device ${deviceId}: ` +
          `desired=${desiredState.targetTemperatureC}°C, ` +
          `actual=${actualState.control.set_temperature_c}°C`
        );
        mismatch = true;
        
        // Re-queue the temperature update
        this.enqueue(deviceId, 'temperature', desiredState.targetTemperatureC);
      }
      
      // Check if state matches
      if (desiredState.targetState !== undefined && 
          actualState.control.thermal_control_status !== desiredState.targetState) {
        this.logger.warn(
          `State mismatch for device ${deviceId}: ` +
          `desired=${desiredState.targetState}, ` +
          `actual=${actualState.control.thermal_control_status}`
        );
        mismatch = true;
        
        // Re-queue the state update
        const stateValue = desiredState.targetState === 'standby' ? 0 : 1;
        this.enqueue(deviceId, 'state', stateValue);
      }
      
      if (!mismatch) {
        this.logger.debug(`Device ${deviceId} state verified successfully`);
      }
    } catch (error) {
      this.logger.error(`Error during state verification for device ${deviceId}: ${error}`);
    }
  }
}