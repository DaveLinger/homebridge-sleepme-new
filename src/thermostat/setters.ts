import {CharacteristicValue} from 'homebridge';
import {Client} from '../sleepme/client';
import {SleepmePlatformAccessory} from '../platformAccessory.js';

// Define temperature constants
const MIN_TEMP_F = 54;
const MAX_TEMP_F = 116;
const LOW_TEMP_MODE = -1;
const HIGH_TEMP_MODE = 999;

interface Setters {
  setTargetState(value: CharacteristicValue): Promise<void>
  setTargetTemp(value: CharacteristicValue): Promise<void>
}

export function newSetters(sleepmePlatformAccessory: SleepmePlatformAccessory, client: Client, id: string): Setters {
  const {platform, accessory} = sleepmePlatformAccessory;
  return {
    setTargetState: (value: CharacteristicValue) => {
      const targetState = (value === 0) ? 'standby' : 'active';
      platform.log(`setting TargetHeatingCoolingState for ${id} to ${targetState} (${value})`);
      return client.setThermalControlStatus(id, targetState).then(r => {
        platform.log(`response (${accessory.displayName}): ${r.status}`);
      });
    },
    setTargetTemp: (value: CharacteristicValue) => {
      // Calculate Fahrenheit temperature from Celsius
      const tempCelsius = value as number;
      let tempF = Math.floor((tempCelsius * (9 / 5)) + 32);
      
      // Check if we should use special LOW or HIGH modes
      if (tempF <= MIN_TEMP_F) {
        tempF = LOW_TEMP_MODE; // Set to LOW mode
        platform.log(`Setting temperature for ${accessory.displayName} to LOW mode (${tempF})`);
      } else if (tempF >= MAX_TEMP_F) {
        tempF = HIGH_TEMP_MODE; // Set to HIGH mode
        platform.log(`Setting temperature for ${accessory.displayName} to HIGH mode (${tempF})`);
      } else {
        platform.log(`Setting temperature for ${accessory.displayName} to ${tempF}F (${tempCelsius}C)`);
      }
      
      return client.setTemperatureFahrenheit(id, tempF)
        .then(r => {
          platform.log(`response (${accessory.displayName}): ${r.status}`);
        });
    },
  };
}