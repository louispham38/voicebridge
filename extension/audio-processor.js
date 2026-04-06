class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0]) return true;

    const inChannel = input[0];

    // Pass through audio so the user still hears the original tab sound
    if (output[0]) {
      output[0].set(inChannel);
    }

    // Send a copy to the main thread for processing
    this.port.postMessage(new Float32Array(inChannel));
    return true;
  }
}

registerProcessor("capture-processor", CaptureProcessor);
