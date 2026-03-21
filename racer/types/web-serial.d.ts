interface SerialPort {
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream | null;
  writable: WritableStream | null;
}

interface SerialOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: "none" | "even" | "odd";
  bufferSize?: number;
  flowControl?: "none" | "hardware";
}

interface Navigator {
  serial?: {
    requestPort(options?: { filters?: unknown[] }): Promise<SerialPort>;
    getPorts(): Promise<SerialPort[]>;
  };
}
