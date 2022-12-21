
export let blockDefinitions = new Map();
export let firstChild = 1;
export let nextSibling = 2;
export let doubleNextSibling = 3;

export function _declareBlock(id, def) {
    blockDefinitions.set(id, def);
}

let CMD_INSTALL_TEMPLATE = 1;

let templateInstallCommandCache = new Map();

export function compileBlockDefinitionToInstallCommand(templateId) {

    let buf;

    if (templateInstallCommandCache.has(templateId)) {
        buf = templateInstallCommandCache.get(templateId);
    } else {

        let blockDef = blockDefinitions.get(templateId);

        let templateBuffer = Buffer.from(blockDef.templateBuffer, 'base64');
        let elScriptBuffer = Buffer.from(blockDef.elScriptBuffer, 'base64');// createElScriptBuffer(blockDef.elScript);

        //console.log('elScriptBuffer', Object.keys(elScriptBuffer));

        buf = Buffer.alloc(1 + 2 + templateBuffer.length + elScriptBuffer.length);


        let offset = 0;
        buf.writeUint8(CMD_INSTALL_TEMPLATE, 0);
        buf.writeUint16BE(templateId, 1);
        offset += 3;

        //buf.writeUint16BE(templateBuffer.length, 3);
        //buf.write(templateString, 5, templateString.length);
        templateBuffer.copy(buf, offset);

        offset += templateBuffer.length;

        //buf.writeUint16BE(elScriptBuffer.length, offset);
        elScriptBuffer.copy(buf, offset);
    }

    return buf;
}