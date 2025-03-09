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
  const setters = newSetters(platformAccessory, readThroughCache, apiQueue, deviceId);

  thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
    .onGet(() => readThroughCache.get()
      .then(response => {
        return response ? thermostatMapper.toCurrentHeatingCoolingState(response.data) : null;
      }));

  const {AUTO, OFF} = Characteristic.TargetHeatingCoolingState;
  thermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
    .setProps({validValues: [OFF, AUTO]})
    .onGet(() => readThroughCache.get()
      .then(response => {
        return response ? thermostatMapper.toTargetHeatingCoolingState(response.data) : null;
      }))
    .onSet(setters.setTargetState);

  thermostatService.getCharacteristic(Characteristic.CurrentTemperature)
    .onGet(() => readThroughCache.get()
      .then(response => {
        return response ? response.data.status.water_temperature_c : null;
      }));

  thermostatService.getCharacteristic(Characteristic.TargetTemperature)
    .onGet(() => readThroughCache.get()
      .then(response => {
        return response ? response.data.control.set_temperature_c : null;
      }))
    .onSet(setters.setTargetTemp);

  thermostatService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
    .onGet(() => readThroughCache.get()
      .then(response => {
        return response ? thermostatMapper.toTemperatureDisplayUnits(response.data) : null;
      }));

  // Add error status characteristic if available
  if (Characteristic.StatusFault) {
    thermostatService.getCharacteristic(Characteristic.StatusFault)
      .onGet(() => {
        const hasError = readThroughCache.hasError();
        return hasError ? Characteristic.StatusFault.GENERAL_FAULT : Characteristic.StatusFault.NO_FAULT;
      });
  }

  return thermostatService;
}