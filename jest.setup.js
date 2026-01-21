// Enable BigInt serialization for Jest
// This must be in a setup file to work in Jest worker processes
if (typeof BigInt.prototype.toJSON !== 'function') {
  BigInt.prototype.toJSON = function() {
    return this.toString();
  };
}
