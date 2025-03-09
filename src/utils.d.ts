// src/utils.d.ts
export function celsiusToFahrenheit(tempC: number): number;
export function fahrenheitToCelsius(tempF: number): number;
export function temperaturesEqual(temp1: number, temp2: number, tolerance?: number): boolean;
export function expectedCelsiusAfterConversion(tempC: number): number;