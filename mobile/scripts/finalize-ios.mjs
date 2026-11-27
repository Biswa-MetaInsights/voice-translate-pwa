// Capacitor emits a Swift 5.9 manifest with a newer enum for iOS 18. The
// string platform API supports this deployment target without raising tools-version.
import { readFile, writeFile } from 'node:fs/promises';
const path=new URL('../ios/App/CapApp-SPM/Package.swift',import.meta.url);
const source=await readFile(path,'utf8');
const fixed=source.replace('.iOS(.v18)', '.iOS("18.0")');
if (!fixed.includes('.iOS("18.0")')) throw new Error('Review the generated iOS platform declaration before building.');
await writeFile(path,fixed);
console.log('Validated generated iOS 18 platform declaration for Swift PackageDescription.');
