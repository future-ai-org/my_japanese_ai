export const WEBGPU_UNAVAILABLE_MESSAGE =
  "WebGPU is unavailable. Open this demo in a current Chrome, Edge, Firefox, or Safari browser with WebGPU enabled. Use HTTPS or localhost, turn on the browser WebGPU flag if navigator.gpu is missing, then confirm an adapter at https://webgpureport.org/.";

export const WEBGPU_ADAPTER_MESSAGE =
  "Unable to find a compatible GPU. Enable WebGPU in your browser, then confirm a hardware adapter at https://webgpureport.org/.";

export function isWebGpuUnavailableMessage(message: string): boolean {
  return (
    /webgpu is unavailable/i.test(message) ||
    /unable to find a compatible gpu/i.test(message)
  );
}

export function isWebGpuUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return isWebGpuUnavailableMessage(error.message);
}
