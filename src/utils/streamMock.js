// Mock file to bypass Node.js stream dependency in browser environments
export class Readable {}
export class Writable {}
export class Duplex {}
export class Transform {}
export class PassThrough {}
export const Stream = class {};

export default {
  Readable,
  Writable,
  Duplex,
  Transform,
  PassThrough,
  Stream
};
