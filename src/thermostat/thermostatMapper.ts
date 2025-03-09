import {DeviceStatus} from '../sleepme/client';
import {SleepmePlatform} from '../platform';

// Define temperature constants
const MIN_TEMP_F = 54;
const MAX_TEMP_F = 116;
const MIN_TEMP_C = 12.2;  // 54F converted to Celsius
const MAX_TEMP_C = 46.7;  // 116F converted to Celsius
const LOW_TEMP_MODE = -1;
const HIGH_TEMP_MODE = 999;

interface Mapper {
  toCurrentHeatingCoolingState: (status: DeviceStatus) => 0 | 1 | 2;
  toTargetHeatingCoolingState: (status: DeviceStatus) => 0 | 3;
  toTemperatureDisplayUnits: (status: DeviceStatus) => 0 | 1
}

class RealMapper implements Mapper {
  constructor(readonly platform: SleepmePlatform) {
  }

  toCurrentHeatingCoolingState(status: DeviceStatus): 0 | 1 | 2 {
    const {OFF, COOL, HEAT} = this.platform.Characteristic.CurrentHeatingCoolingState;
    
    if (status.control.thermal_control_status === 'standby') {
      return OFF;
    }
    
    // Get the target temperature, handling special cases
    let targetTempC = status.control.set_temperature_c;
    if (status.control.set_temperature_f === LOW_TEMP_MODE) {
      targetTempC = MIN_TEMP_C;
    } else if (status.control.set_temperature_f === HIGH_TEMP_MODE) {
      targetTempC = MAX_TEMP_C;
    }
    
    if (targetTempC <= status.status.water_temperature_c) {
      return COOL;
    }
    return HEAT;
  }

  toTargetHeatingCoolingState(status: DeviceStatus): 0 | 3 {
    const {OFF, AUTO} = this.platform.Characteristic.TargetHeatingCoolingState;
    return status.control.thermal_control_status === 'standby' ?
      OFF :
      AUTO;
  }

  toTemperatureDisplayUnits(status: DeviceStatus): 0 | 1 {
    return status.control.display_temperature_unit === 'c' ? 0 : 1;
  }
}

export function NewMapper(platform: SleepmePlatform): Mapper {
  return new RealMapper(platform);
}