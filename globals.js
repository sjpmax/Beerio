
// globals.js
import { Buffer } from 'buffer';
import process from 'process';

if (typeof global !== 'undefined') {
  global.Buffer = Buffer;
  global.process = process;
}

if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  window.process = process;
}