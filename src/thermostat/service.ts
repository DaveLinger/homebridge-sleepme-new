import {Service} from 'homebridge';
import {SleepmePlatformAccessory} from '../platformAccessory.js';
import ReadThroughCache from '../readThroughCache.js';
import {NewMapper} from './thermostatMapper.js';
import {newSetters} from './setters.js';

// Define temperature range constants
const MIN_TEMP_F = 54;
const MAX_TEMP_F = 116;
const MIN_TEMP_C = 12.2; // 54F converted to Celsius
const MAX_TEMP_C = 46.7; // 116F converted to Celsius

export function createThermostatService(
  platformAccessory: SleepmePlatformAccessory,
  readThroughCache: ReadThroughCache,
  deviceId: string): Service {
  const {platform, accessory} = platformAccessory;
  const {Characteristic} = platform;
  const thermostatMapper = NewMapper(platform);
  const thermostatService = accessory.getService(platform.Service.Thermostat) ||
    accessory.addService(platform.Service.Thermostat, `${accessory.displayName} - Dock Pro`);
  const setters = newSetters(platformAccessory, readThroughCache.client, deviceId);

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
    .setProps({
      minValue: MIN_TEMP_C,
      maxValue: MAX_TEMP_C,
      minStep: 0.5
    })
    .onGet(() => readThroughCache.get()
      .then(response => {
        if (!response) return null;
        
        // Handle special API values for LOW/HIGH
        const tempF = response.data.control.set_temperature_f;
        if (tempF === -1) {
          return MIN_TEMP_C; // Map LOW (-1) to minimum temperature
        } else if (tempF === 999) {
          return MAX_TEMP_C; // Map HIGH (999) to maximum temperature
        }
        
        return response.data.control.set_temperature_c;
      }))
    .onSet(setters.setTargetTemp);

  thermostatService.getCharacteristic(Characteristic.TemperatureDisplayUnits)
    .onGet(() => readThroughCache.get()
      .then(response => {
        return response ? thermostatMapper.toTemperatureDisplayUnits(response.data) : null;
      }));

  return thermostatService;
}