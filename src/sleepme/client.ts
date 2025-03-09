import axios, {AxiosInstance, AxiosError} from 'axios';

export type ClientResponse<T> = {
  data: T;
  status: number;
};

export class Client {
  readonly token: string;
  private readonly axiosClient: AxiosInstance;
  private readonly logger?: (message: string) => void;

  constructor(token: string, baseURL = 'https://api.developer.sleep.me', logger?: (message: string) => void) {
    this.token = token;
    this.logger = logger;
    this.axiosClient = axios.create({baseURL: baseURL});
    
    // Add response interceptor to log all responses
    this.axiosClient.interceptors.response.use(
      (response) => {
        if (this.logger) {
          this.logger(`API Response: ${response.config.method?.toUpperCase()} ${response.config.url} - Status: ${response.status}`);
        }
        return response;
      },
      (error: AxiosError) => {
        if (this.logger) {
          const status = error.response?.status || 'Unknown';
          const method = error.config?.method?.toUpperCase() || 'Unknown';
          const url = error.config?.url || 'Unknown';
          this.logger(`API Error: ${method} ${url} - Status: ${status} - ${error.message}`);
          
          // If there's response data, log that too
          if (error.response?.data) {
            this.logger(`Error details: ${JSON.stringify(error.response.data)}`);
          }
          
          // Log rate limit headers if they exist
          const rateLimitLimit = error.response?.headers?.['x-ratelimit-limit'];
          const rateLimitRemaining = error.response?.headers?.['x-ratelimit-remaining'];
          const rateLimitReset = error.response?.headers?.['x-ratelimit-reset'];
          
          if (rateLimitLimit || rateLimitRemaining || rateLimitReset) {
            this.logger(`Rate limit info - Limit: ${rateLimitLimit}, Remaining: ${rateLimitRemaining}, Reset: ${rateLimitReset}`);
          }
        }
        return Promise.reject(error);
      }
    );
    
    // Add request interceptor to log all requests
    this.axiosClient.interceptors.request.use(
      (config) => {
        if (this.logger) {
          this.logger(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
        }
        return config;
      },
      (error) => {
        if (this.logger) {
          this.logger(`Request error: ${error.message}`);
        }
        return Promise.reject(error);
      }
    );
  }

  headers(): object {
    return {
      'Authorization': `Bearer ${this.token}`,
    };
  }

  listDevices(): Promise<ClientResponse<Device[]>> {
    return this.axiosClient.get<Device[]>('/v1/devices',
      {headers: this.headers()});
  }

  getDeviceStatus(id: string): Promise<ClientResponse<DeviceStatus>> {
    return this.axiosClient.get<DeviceStatus>('/v1/devices/' + id,
      {headers: this.headers()});
  }

  setTemperatureFahrenheit(id: string, temperature: number): Promise<ClientResponse<Control>> {
    return this.axiosClient.patch<Control>('/v1/devices/' + id, {set_temperature_f: temperature},
      {headers: this.headers()});
  }

  setTemperatureCelsius(id: string, temperature: number): Promise<ClientResponse<Control>> {
    return this.axiosClient.patch<Control>('/v1/devices/' + id, {set_temperature_c: temperature},
      {headers: this.headers()});
  }

  setThermalControlStatus(id: string, targetState: 'standby' | 'active'): Promise<ClientResponse<Control>> {
    return this.axiosClient.patch<Control>('/v1/devices/' + id, {thermal_control_status: targetState},
      {headers: this.headers()});
  }
}

export type Device = {
  id: string;
  name: string;
  attachments: string[];
};

export type Control = {
  brightness_level: number;
  display_temperature_unit: 'c' | 'f';
  set_temperature_c: number;
  set_temperature_f: number;
  thermal_control_status: 'standby' | 'active';
  time_zone: string;
};

export type DeviceStatus = {
  about: {
    firmware_version: string;
    ip_address: string;
    lan_address: string;
    mac_address: string;
    model: string;
    serial_number: string;
  };
  control: Control;
  status: {
    is_connected: boolean;
    is_water_low: boolean;
    water_level: number;
    water_temperature_f: number;
    water_temperature_c: number;
  };
};