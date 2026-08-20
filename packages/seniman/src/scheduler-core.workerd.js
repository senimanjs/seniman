import schedulerCoreModule from "./scheduler-core.wasm";

export default new WebAssembly.Instance(schedulerCoreModule, {}).exports;
