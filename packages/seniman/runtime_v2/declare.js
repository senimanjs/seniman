
export let blockDefinitions = new Map();
export let firstChild = 1;
export let nextSibling = 2;
//export let doubleNextSibling = 3;

let lastBlockId = 2000;

function createNewBlockId() {
    lastBlockId++;
    return lastBlockId;
}

export function _declareBlock(def) {
    let blockId = createNewBlockId();

    blockDefinitions.set(blockId, {
        id: blockId,
        tokens: def.tokens,
        templateBuffer: Buffer.from(def.templateBuffer, 'base64'),
        elScriptBuffer: Buffer.from(def.elScriptBuffer, 'base64')
    });

    return blockId;
}

let CMD_INSTALL_TEMPLATE = 1;
let CMD_MODIFY_TOKENMAP = 12;

let variableScratchBuffer = Buffer.alloc(2048);
let installScratchBuffer = Buffer.alloc(4096 * 2);

export function streamBlockTemplateInstall(window, templateId) {

    let blockDef = blockDefinitions.get(templateId);

    let [tokenIndexes, installList] = installTokens2(blockDef.tokens, window.tokenList);

    if (installList) {
        variableScratchBuffer.writeUint8(CMD_MODIFY_TOKENMAP, 0);

        let offset2 = 1;

        installList.forEach((token) => {
            let tokenLength = Buffer.byteLength(token);

            variableScratchBuffer.writeUint8(tokenLength, offset2);
            offset2++;

            variableScratchBuffer.write(token, offset2, tokenLength);
            offset2 += tokenLength;
        });

        variableScratchBuffer.writeUint8(0, offset2);
        offset2++;

        // copy the scratch buffer to a real command buffer
        variableScratchBuffer.copy(window._allocCommandBuffer(offset2), 0, 0, offset2);
    }

    //////////////////////////

    let offset = 0;
    installScratchBuffer.writeUint8(CMD_INSTALL_TEMPLATE, 0);
    installScratchBuffer.writeUint16BE(templateId, 1);
    offset += 3;

    tokenIndexes.forEach((tokenId) => {
        installScratchBuffer.writeUint16BE(tokenId, offset);
        offset += 2;
    });

    installScratchBuffer.writeUint16BE(0, offset);
    offset += 2;

    blockDef.templateBuffer.copy(installScratchBuffer, offset);
    offset += blockDef.templateBuffer.length;

    blockDef.elScriptBuffer.copy(installScratchBuffer, offset);
    offset += blockDef.elScriptBuffer.length;

    // copy the scratch buffer to a real command buffer
    installScratchBuffer.copy(window._allocCommandBuffer(offset), 0, 0, offset);
}

function installTokens2(blockTokens, tokenList) {

    let tokenIndexes = [];
    let installationList;

    for (let token of blockTokens) {
        if (tokenList.has(token)) {
            tokenIndexes.push(tokenList.get(token));
        } else {
            let index = tokenList.size;

            tokenList.set(token, index);

            installationList ? installationList.push(token) : installationList = [token];
            tokenIndexes.push(index);
        }
    }

    return [tokenIndexes, installationList];
}

export let clientFunctionDefinitions = new Map();

let lastClientFunctionId = 3000;

function createNewClientFunctionId() {
    lastClientFunctionId++;
    return lastClientFunctionId;
}

export function _declareClientFunction(def) {

    let clientFunctionId = createNewClientFunctionId();

    clientFunctionDefinitions.set(clientFunctionId, def);

    return clientFunctionId;
}