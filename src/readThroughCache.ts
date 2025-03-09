import {Client, DeviceStatus, ClientResponse} from './sleepme/client';
import {Logger} from 'homebridge';
import {AxiosError} from 'axios';

class ReadThroughCache {
  private value?: ClientResponse<DeviceStatus>;
  private request?: Promise<ClientResponse<DeviceStatus> | null>;
  private responseTimestamp?: Date;
  private responseExpireAt?: Date;
  private errorCount = 0;
  private expirationMS = 1000;

  constructor(readonly client: Client, readonly deviceId: string, private readonly log: Logger) {
  }

  get(): Promise<null | ClientResponse<DeviceStatus>> {
    this.log.debug(`Get device status request for ID ${this.deviceId}`);
    this.log.debug(`Cache state: timestamp=${this.responseTimestamp}, expireAt=${this.responseExpireAt}`);
    
    // Check if we have a cached value that's still valid
    if (this.value && this.responseExpireAt &&
      (new Date().valueOf() < this.responseExpireAt.valueOf())) {
      this.log.debug(`Using cached value from ${this.responseTimestamp}`);
      return Promise.resolve(this.value);
    }
    
    // If there's already a request in progress, return that
    if (this.request) {
      this.log.debug('Request already in progress, reusing existing request');
      return this.request;
    }
    
    // Otherwise, make a new request
    this.log.debug(`Making new API request for device ${this.deviceId}`);
    this.request = this.client.getDeviceStatus(this.deviceId).then(response => {
      this.log.debug(`API request completed successfully: status=${response.status}`);
      
      // Deep log the actual device data for debugging
      this.log.debug(`Device control: ${JSON.stringify(response.data.control)}`);
      this.log.debug(`Device status: ${JSON.stringify(response.data.status)}`);
      
      // Update cache
      this.value = response;
      this.responseTimestamp = new Date();
      this.responseExpireAt = new Date(this.responseTimestamp.valueOf() + this.expirationMS);
      this.request = undefined;
      this.errorCount = 0;
      
      return response;
    }).catch((err: Error | AxiosError) => {
      this.errorCount += 1;
      
      // Log detailed error information
      this.log.error(`API error for device ${this.deviceId}: ${err.message}`);
      
      // If it's an Axios error, log more details
      if (axios.isAxiosError(err)) {
        this.log.error(`HTTP status: ${err.response?.status || 'unknown'}`);
        this.log.error(`Request URL: ${err.config?.url || 'unknown'}`);
        this.log.error(`Request method: ${err.config?.method || 'unknown'}`);
        
        // Check if this might be a rate limit issue
        if (err.response?.status === 429) {
          this.log.error('Rate limit exceeded! API is being called too frequently.');
          
          // Log rate limit headers if available
          const resetTime = err.response.headers?.['x-ratelimit-reset'];
          if (resetTime) {
            this.log.error(`Rate limit resets at: ${resetTime}`);
          }
        }
      }
      
      // If we have a previous value, use exponential backoff
      if (this.value) {
        const backoffDuration = Math.max(Math.pow(2, this.errorCount) * this.expirationMS, 60 * 1000);
        this.responseExpireAt = new Date(new Date().valueOf() + backoffDuration);
        this.log.warn(`Using previous value and backing off until ${this.responseExpireAt}`);
        return this.value;
      }
      
      this.log.error('No previous value available, returning null');
      this.request = undefined;
      return null;
    });
    
    return this.request;
  }
}

export default ReadThroughCache;