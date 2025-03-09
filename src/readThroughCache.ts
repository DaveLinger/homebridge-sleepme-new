// src/readThroughCache.ts
import {Client, DeviceStatus, ClientResponse} from './sleepme/client';
import {Logger} from 'homebridge';
import {AxiosError} from 'axios';

class ReadThroughCache {
  private value?: ClientResponse<DeviceStatus>;
  private request?: Promise<ClientResponse<DeviceStatus> | null>;
  private responseTimestamp?: Date;
  private responseExpireAt?: Date;
  private errorCount = 0;
  private lastErrorCode?: number;
  private lastErrorMessage?: string;
  
  constructor(
    readonly client: Client, 
    readonly deviceId: string, 
    private readonly log: Logger,
    private readonly expirationMS = 1000, // Default cache expiry of 1 second
  ) {}

  get(): Promise<null | ClientResponse<DeviceStatus>> {
    this.log.debug(`get device status (responseTimestamp:${this.responseTimestamp}, responseExpireAt: ${this.responseExpireAt})`);
    
    // Return cached value if it's still valid
    if (this.value && this.responseExpireAt &&
      (new Date().valueOf() < this.responseExpireAt.valueOf())) {
      this.log.debug(`returning previously fetched value from ${this.responseTimestamp}`);
      return Promise.resolve(this.value);
    }
    
    // If there's already a request in flight, return it
    if (this.request) {
      this.log.debug('returning current in-flight request');
      return this.request;
    }
    
    // Make a new request
    this.log.debug('making new request');
    this.request = this.client.getDeviceStatus(this.deviceId)
      .then(response => {
        this.log.debug(`request completed with status: ${response.status}`);
        this.log.debug(`response: ${JSON.stringify(response.data, null, '  ')}`);
        
        this.value = response;
        this.responseTimestamp = new Date();
        this.responseExpireAt = new Date(this.responseTimestamp.valueOf() + this.expirationMS);
        this.request = undefined;
        this.errorCount = 0;
        this.lastErrorCode = undefined;
        this.lastErrorMessage = undefined;
        
        return response;
      })
      .catch((err: Error | AxiosError) => {
        this.errorCount += 1;
        
        // Extract error details for better diagnostics
        if (axios.isAxiosError(err)) {
          this.lastErrorCode = err.response?.status;
          this.lastErrorMessage = `API Error ${this.lastErrorCode}: ${err.message}`;
          this.log.error(this.lastErrorMessage);
        } else {
          this.lastErrorMessage = `General error: ${err.message}`;
          this.log.error(this.lastErrorMessage);
        }
        
        // If we have a previous value, extend its lifetime with exponential backoff
        if (this.value) {
          const backoffDuration = Math.min(
            Math.max(Math.pow(2, this.errorCount) * this.expirationMS, 5000), // min 5 seconds
            60 * 1000 * 5 // max 5 minutes
          );
          this.responseExpireAt = new Date(new Date().valueOf() + backoffDuration);
          this.log.warn(`Error fetching device status. Using cached value and backing off until ${this.responseExpireAt}`);
          return this.value;
        }
        
        this.request = undefined;
        return null;
      });
    
    return this.request;
  }
  
  // Force an immediate refresh of the cache
  refresh(): Promise<null | ClientResponse<DeviceStatus>> {
    if (this.request) {
      return this.request;
    }
    
    // Invalidate existing cache
    this.responseExpireAt = undefined;
    return this.get();
  }
  
  // Get the last error information
  getLastError(): { code?: number, message?: string, count: number } {
    return {
      code: this.lastErrorCode,
      message: this.lastErrorMessage,
      count: this.errorCount
    };
  }
  
  // Check if we're currently in an error state
  hasError(): boolean {
    return this.errorCount > 0;
  }
  
  // Force an immediate refresh of the cache
  refresh(): Promise<null | ClientResponse<DeviceStatus>> {
    // Clear any in-flight request
    this.request = undefined;
    
    // Invalidate existing cache
    this.responseExpireAt = undefined;
    
    // Make a fresh request
    return this.get();
  }
}

export default ReadThroughCache;