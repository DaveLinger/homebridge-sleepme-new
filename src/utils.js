// src/utils.ts
// This single file contains all utility functions 

/**
 * Converts Celsius to Fahrenheit with proper rounding
 * @param tempC Temperature in Celsius
 * @returns Temperature in Fahrenheit (rounded to nearest integer)
 */
export function celsiusToFahrenheit(tempC: number): number {
  // Calculate with maximum precision, then round to whole number
  return Math.round((tempC * 9/5) + 32);
}

/**
 * Converts Fahrenheit to Celsius with proper precision
 * @param tempF Temperature in Fahrenheit
 * @returns Temperature in Celsius (to one decimal place)
 */
export function fahrenheitToCelsius(tempF: number): number {
  // Calculate with maximum precision, then round to one decimal place
  return Math.round(((tempF - 32) * 5/9) * 10) / 10;
}

/**
 * Check if two temperatures are effectively equal within a tolerance
 * @param temp1 First temperature value
 * @param temp2 Second temperature value
 * @param tolerance Maximum allowed difference (default 0.6°C)
 * @returns True if temperatures are within tolerance
 */
export function temperaturesEqual(temp1: number, temp2: number, tolerance = 0.6): boolean {
  return Math.abs(temp1 - temp2) <= tolerance;
}

/**
 * Determine if a Celsius temperature would round-trip properly through Fahrenheit conversion
 * @param tempC Temperature in Celsius
 * @returns The expected Celsius value after converting to F and back
 */
export function expectedCelsiusAfterConversion(tempC: number): number {
  const tempF = celsiusToFahrenheit(tempC);
  return fahrenheitToCelsius(tempF);
}