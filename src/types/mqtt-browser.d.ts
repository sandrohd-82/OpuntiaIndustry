declare module "mqtt/dist/mqtt.esm.js" {
  const mqtt: {
    connect: (url: string, opts?: Record<string, unknown>) => {
      connected: boolean;
      end: (force?: boolean) => void;
    };
  };
  export default mqtt;
}
