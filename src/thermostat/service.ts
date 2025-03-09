// src/thermostat/service.ts
import {Service} from 'homebridge';
import {SleepmePlatformAccessory} from '../platformAccessory.js';
import ReadThroughCache from '../readThroughCache.js';
import {NewMapper} from './thermostatMapper.js';
import {newSetters} from './setters.js';
import {ApiQueue} from '../queue/apiQueue.js';

export function createThermostatService(
  platformAccessory: SleepmePlatformAccessory,
  readThroughCache: ReadThroughCache,
  apiQueue: ApiQueue,
  deviceId: string): Service {
  const {platform, accessory} = platformAccessory;
  const {Characteristic} = platform;
  const thermostatMapper = NewMapper(platform);
  const thermostatService = accessory.getService(platform.Service.Thermostat) ||
    accessory.addService(platform.Service.Thermostat, `${accessory.displayName} - Dock Pro`);
  
  // Register the cache with the API queue for verification
  apiQueue.registerCache(deviceId, readThroughCache);
  
  // Create setters with the API queue
  const setters = newSetters(platformAccessory, apiQueue, deviceId);

  // Add default values to make Homebridge startup faster
  const defaultValues = {
    currentHeatingCoolingState: Characteristic.CurrentHeatingCoolingState.OFF,
    targetHeatingCoolingState: Characteristic.TargetHeatingCoolingState.OFF,
    currentTemperature: 22.0, // Default to room temperature
    targetTemperature: 22.0,
    temperatureDisplayUnits: Characteristic.TemperatureDisplayUnits.CELSIUS
  };

  // Store cached values to avoid excessive updates to HomeKit
  const cachedValues = {...defaultValues};

  thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
    .onGet(async () => {
      // Return cached value immediately for quick response
      try {
        const response = await readThroughCache.get();
        if (response) {
          const newValue = thermostatMapper.toCurrentHeatingCoolingState(response.data);
          if (cachedValues.currentHeatingCoolingState !== newValue) {
            cachedValues.currentHeatingCoolingState = newValue;
          }
          return newValue;
        }
      } catch (error) {
        platform.log.error(`Error getting CurrentHeatingCoolingState: ${error}`);
      }
      return cachedValues.currentHeatingCoolingState;
    });

  const {AUTO, OFF} = Characteristic.TargetHeatingCoolingState;
  thermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
    .setProps({validValues: [OFF, AUTO]})
    .onGet(async () => {
      // Return cached value immediately for quick response
      try {
        const response = await readThroughCache.get();
        if (response) {
          const newValue = thermostatMapper.toTargetHeatingCoolingState(response.data);
          if (cachedValues.targetHeatingCoolingState !== newValue) {
            cachedValues.targetHeatingCoolingState = newValue;
          }
          return newValue;
        }
      } catch (error) {
        platform.log.error(`Error getting TargetHeatingCoolingState: ${error}`);
      }
      return cachedValues.targetHeatingCoolingState;
    })
    .onSet(setters.setTargetState);

  thermostatService.getCharacteristic(Characteristic.CurrentTemperature)
    .onGet(async () => {
      // Return cached value immediately for quick response
      try {
        const response = await readThroughCache.get();
        if (response) {
          const newValue = response.data.status.water_temperature_c;
          if (cachedValues.currentTemperature !== newValue) {
            cachedValues.currentTemperature = newValue;
          }
          return newValue;
        }
      } catch (error) {
        platform.log.error(`Error getting CurrentTemperature: ${error}`);
      }
      return cachedValues.currentTemperature;
    });

  thermostatService.getCharacteristic(Characteristic.TargetTemperature)
    .onGet(async () => {
      // Return cached value immediately for quick response
      try {
        const response = await readThroughCache.get();
        if (response) {
          const newValue = response.data.control.set_temperature_c;
          if (cachedValues.targetTemperature !== newValue) {
            cachedValues.targetTemperature = newValue;
          }
          return newValue;
        }
      } catch (error) {
        platform.log.error(`Error getting TargetTemperature: ${error}`);
      }
      return cachedValues.targetTemperature;
    })
    .onSet(setters.setTargetTemp);

  thermostatService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
    .onGet(async () => {
      // Return cached value immediately for quick response
      try {
        const response = await readThroughCache.get();
        if (response) {
          const newValue = thermostatMapper.toTemperatureDisplayUnits(response.data);
          if (cachedValues.temperatureDisplayUnits !== newValue) {
            cachedValues.temperatureDisplayUnits = newValue;
          }
          return newValue;
        }
      } catch (error) {
        platform.log.error(`Error getting TemperatureDisplayUnits: ${error}`);
      }
      return cachedValues.temperatureDisplayUnits;
    });

  // Prefetch the initial values after a short delay
  setTimeout(() => {
    readThroughCache.get().then(response => {
      if (response) {
        platform.log.debug(`Initial state loaded for ${accessory.displayName}`);
      }
    }).catch(err => {
      platform.log.warn(`Error fetching initial state for ${accessory.displayName}: ${err}`);
    });
  }, 1000);

  return thermostatService;
}