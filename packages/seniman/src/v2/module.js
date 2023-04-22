
export function createInternalModule(id) {
  return {
    type: "module",
    id
  };
}

let moduleId = 10;
// const moduleMap = new Map();

export function createModule(clientFn) {

  // verify that the clientFn argument is a clientFn instance

  moduleId++;

  let module = {
    type: "module",
    id: moduleId,
    clientFn
  };

  // moduleMap.set(moduleId, module);

  return module;
}
