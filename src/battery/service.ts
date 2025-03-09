// src/battery/service.ts
import {Service} from 'homebridge';
import ReadThroughCache from '../readThroughCache.js';
import {SleepmePlatformAccessory} from '../platformAccessory';

export function createBatteryService(platformAccessory: SleepmePlatformAccessory, readThroughCache: ReadThroughCache): Service {
  const {platform, accessory} = platformAccessory;
  const {StatusLowBattery, BatteryLevel} = platform.Characteristic;
  const batteryService = accessory.getService(platform.Service.Battery) ||
    accessory.addService(platform.Service.Battery, `${accessory.displayName} - Dock Pro Water Level`);

  // Default values for quick response during startup
  const defaultValues = {
    isWaterLow: false,
    waterLevel: 100
  };

  // Cached values to avoid unnecessary updates
  const cachedValues = {...defaultValues};

  batteryService.getCharacteristic(StatusLowBattery)
    .onGet(async () => {
      try {
        const response = await readThroughCache.get();
        if (response) {
          const newValue = response.data.status.is_water_low;
          if (cachedValues.isWaterLow !== newValue) {
            cachedValues.isWaterLow = newValue;
          }
          return newValue ? StatusLowBattery.BATTERY_LEVEL_LOW : StatusLowBattery.BATTERY_LEVEL_NORMAL;
        }
      } catch (error) {
        platform.log.error(`Error getting water low status: ${error}`);
      }
      return cachedValues.isWaterLow ? 
        StatusLowBattery.BATTERY_LEVEL_LOW : 
        StatusLowBattery.BATTERY_LEVEL_NORMAL;
    });

  batteryService.getCharacteristic(BatteryLevel)
    .onGet(async () => {
      try {
        const response = await readThroughCache.get();
        if (response) {
          const newValue = response.data.status.water_level;
          if (cachedValues.waterLevel !== newValue) {
            cachedValues.waterLevel = newValue;
          }
          return newValue;
        }
      } catch (error) {
        platform.log.error(`Error getting water level: ${error}`);
      }
      return cachedValues.waterLevel;
    });

  return batteryService;
}