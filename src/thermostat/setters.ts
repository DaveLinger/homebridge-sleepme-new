// src/thermostat/setters.ts
import {CharacteristicValue} from 'homebridge';
import {SleepmePlatformAccessory} from '../platformAccessory.js';
import {ApiQueue} from '../queue/apiQueue.js';

interface Setters {
  setTargetState(value: CharacteristicValue): Promise<void>
  setTargetTemp(value: CharacteristicValue): Promise<void>
}

export function newSetters(
  sleepmePlatformAccessory: SleepmePlatformAccessory,
  apiQueue: ApiQueue,
  id: string
): Setters {
  const {platform, accessory} = sleepmePlatformAccessory;
  
  return {
    setTargetState: (value: CharacteristicValue) => {
      const targetState = value === 0 ? 'standby' : 'active';
      platform.log.info(`Setting TargetHeatingCoolingState for ${accessory.displayName} to ${targetState} (${value})`);
      
      // Immediately enqueue the API request
      apiQueue.enqueue(id, 'state', value);
      
      // Return immediately for a responsive UI
      return Promise.resolve();
    },
    
    setTargetTemp: (value: CharacteristicValue) => {
      const tempC = value as number;
      const tempF = Math.floor((tempC * (9 / 5)) + 32);
      platform.log.info(`Setting TargetTemperature for ${accessory.displayName} to ${tempF}°F (${tempC}°C)`);
      
      // Immediately enqueue the API request
      apiQueue.enqueue(id, 'temperature', tempC);
      
      // Return immediately for a responsive UI
      return Promise.resolve();
    },
  };
}