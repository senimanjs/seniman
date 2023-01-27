import parser from "@babel/parser";
import generator from "@babel/generator";
import traverse from "@babel/traverse";

import { createCompilerInternalImportsExpression, createDeclareBlockExpression, createDeclareClientFunctionExpression } from "./declare.js";

let generate = generator.default;

let lastBlockId = 3000;

function createNewBlockId() {
    lastBlockId++;
    return lastBlockId;
}

let lastClientFunctionId = 1000;

function createNewClientFunctionId() {
    lastClientFunctionId++;
    return lastClientFunctionId;
}

const eventTypeIdMap = {
    'onClick': 1,
    'onFocus': 2,
    'onBlur': 3,
    'onChange': 4,
    'onScroll': 5,
    'onKeyDown': 6,
    'onKeyUp': 7
};

const eventNames = Object.keys(eventTypeIdMap);
const eventNamesSet = new Set(eventNames);

const styleAttributeNames = ['classList', 'style', 'class'];

const validHtmlElementNames = new Set([
    'div',
    'span',
    'input',
    'label',
    'img',
    'p',
    'a',
    'hr',
    'br',
    'ul',
    'li',
    'button',
    'select',
    'option',
    'meta',
    'style',
    'title',
    'textarea',
    'svg',
    'path',
    'strong',
    'link',
    'code',
    'pre'
]);


const compressionRegistry = {
    elementNames: new Set(),
    elementAttributeNames: new Set(['class', 'style']),
    stylePropertyKeys: new Set(),
    stylePropertyValues: new Set()
}

export function getCompiledCompressionMap() {

    let buf = Buffer.alloc(32678); //1 + 2 + bufContentLength);
    let ptr = 0;

    // note: stylePropertyValues is currently not be needed since we don't compress
    // the values, only the keys
    let reverseIndexMap = {
        elementNames: {},
        elementAttributeNames: {},
        stylePropertyKeys: {},
        stylePropertyValues: {}
    }

    let i = 0;

    compressionRegistry.elementNames.forEach((name) => {
        buf.writeUint8(name.length, ptr);
        buf.write(name, ptr + 1, name.length);

        ptr += (1 + name.length);

        reverseIndexMap.elementNames[name] = i;
        i++;
    });

    buf.writeUint8(0, ptr);
    ptr += 1;

    i = 0;
    compressionRegistry.elementAttributeNames.forEach((name) => {
        buf.writeUint8(name.length, ptr);
        buf.write(name, ptr + 1, name.length);

        ptr += (1 + name.length);

        reverseIndexMap.elementAttributeNames[name] = i;
        i++;
    });

    buf.writeUint8(0, ptr);
    ptr += 1;

    i = 0;
    compressionRegistry.stylePropertyKeys.forEach((name) => {
        buf.writeUint8(name.length, ptr);
        buf.write(name, ptr + 1, name.length);

        ptr += (1 + name.length);

        reverseIndexMap.stylePropertyKeys[name] = i;
        i++;
    });

    buf.writeUint8(0, ptr);
    ptr += 1;

    i = 0;
    compressionRegistry.stylePropertyValues.forEach((name) => {
        buf.writeUint8(name.length, ptr);
        buf.write(name, ptr + 1, name.length);

        ptr += (1 + name.length);
        reverseIndexMap.stylePropertyValues[name] = i;
        i++;
    });

    //console.log('LENS:', compressionRegistry.elementNames.size, compressionRegistry.elementAttributeNames.size, compressionRegistry.stylePropertyKeys.size, compressionRegistry.stylePropertyValues.size);

    buf.writeUint8(0, ptr);
    ptr += 1;


    //buf.writeUint16LE(ptr - 3, 1);

    return {
        compressionMapInstallBuffer: buf.subarray(0, ptr),
        reverseIndexMapJsonString: JSON.stringify(reverseIndexMap, null, 4)
    };
}


/*

function inverse(obj) {
    var retobj = {};
    for (var key in obj) {
        retobj[obj[key]] = key;
    }
    return retobj;
}
export function getDecodeCompressionMap() {
    let encodeCompressionMap = getEncodeCompressionMap();
    return {
        typeIdMapping: inverse(encodeCompressionMap.typeIdMapping),
        staticAttributeMap: inverse(encodeCompressionMap.staticAttributeMap),
    };
}
*/

function getEncodeCompressionMap() {
    let typeIdMapping = {};
    let staticAttributeMap = {};
    let stylePropertyKeys = {};
    let stylePropertyValues = {};

    let i = 0;
    compressionRegistry.elementNames.forEach((name) => {
        //console.log('name', name, i);
        i++;

        typeIdMapping[name] = i;
    });

    i = 0;
    compressionRegistry.elementAttributeNames.forEach((name) => {
        //console.log('name', name, i);
        i++;

        staticAttributeMap[name] = i;
    });

    i = 0;
    compressionRegistry.stylePropertyKeys.forEach((name) => {
        //console.log('name', name, i);
        i++;
        stylePropertyKeys[name] = i;
    });

    i = 0;
    compressionRegistry.stylePropertyValues.forEach((name) => {
        //console.log('name', name, i);
        i++;
        stylePropertyValues[name] = i;
    });

    return {
        typeIdMapping,
        staticAttributeMap,
        stylePropertyKeys,
        stylePropertyValues
    };
}


function getAttribute(node, name) {
    let index = node.openingElement.attributes.findIndex(attrNode => attrNode.name.name == name);
    return index > -1 ? node.openingElement.attributes[index].value : null;
}

function getAttributeNames(node) {
    let names = new Set();

    node.openingElement.attributes.forEach(attrNode => {
        names.add(attrNode.name.name);
    });

    return names;
}

function eventNameInAttributeNames(names) {
    for (let i = 0; i < eventNames.length; i++) {
        if (names.has(eventNames[i])) {
            return true;
        }
    }

    return false;
}

function stylingAttributeInAttributeNames(names) {
    for (let i = 0; i < styleAttributeNames.length; i++) {
        if (names.has(styleAttributeNames[i])) {
            return true;
        }
    }

    return false;
}

function isStaticExpression(expression) {
    return expression.type == 'StringLiteral' || expression.type == 'NumericLiteral';
}

function nodeHasDynamicAttribute(node) {
    let attributes = node.openingElement.attributes;

    for (let i = 0; i < attributes.length; i++) {
        let attr = attributes[i];
        let attrName = attr.name.name;
        let value = attr.value;

        if (attrName == 'style') {
            if (value.type == 'JSXExpressionContainer') {
                // Only support ObjectExpression for now
                for (let j = 0; j < value.expression.properties.length; j++) {
                    let prop = value.expression.properties[j];

                    if (!isStaticExpression(prop.value)) {
                        return true;
                    }
                }

            } else {
                // Don't support static string styles for now
                throw new Error();
            }
        } else {
            if (value.type == 'JSXExpressionContainer') {
                if (!isStaticExpression(value.expression)) {
                    return true;
                }
            }
        }
    }

    return false;
}

export function processFile(fileName, fileString) {

    console.log('========================\nprocessing', fileName);

    let parsed = parser.parse(fileString.toString(), {
        // parse in strict mode and allow module declarations
        sourceType: "module",

        attachComment: false,
        ranges: false,
        plugins: [
            // enable jsx and flow syntax
            "jsx",
            "flow",
        ],
    });

    let gatheredUIBlocks = [];
    let gatheredClientFunctions = [];

    function processJSX(node, parentElement, contextBlock) {

        if (node.type == 'JSXFragment') {
            let children = _cleanChildren(node.children);
            return {
                "type": "ArrayExpression",
                "elements": children.map(child => {
                    return processJSX(child, null, null);
                })
            };

        } else if (node.type == 'JSXElement') {

            let isHTMLElement = node.openingElement.name.type == 'JSXIdentifier' &&
                validHtmlElementNames.has(node.openingElement.name.name);

            let isNewBlockEnclosingElement = parentElement == null;

            // is dom element
            if (isHTMLElement) {

                let elementName = node.openingElement.name.name;

                compressionRegistry.elementNames.add(elementName);

                let attributeNames = getAttributeNames(node);
                let hasAttributes = attributeNames.size > 0;
                let hasEventHandlers = hasAttributes && eventNameInAttributeNames(attributeNames);
                //let hasStyling = hasAttributes && stylingAttributeInAttributeNames(attributeNames);

                let element = {
                    type: elementName,
                    children: [],
                    isTarget: false,
                    style: [],
                    attributes: {}
                };

                let targetId;

                if (isNewBlockEnclosingElement) {
                    contextBlock = {
                        id: createNewBlockId(),
                        rootElement: element,
                        anchors: [],
                        targetElementCount: 0,
                        eventHandlers: [],
                        styleEffects: []
                    };
                    gatheredUIBlocks.push(contextBlock);

                    // no need to allocate manual target entry to root element 
                    // -- it always gets the ID of 255.
                    targetId = 255;
                } else {
                    parentElement.children.push(element);

                    let hasDynamicAttribute = nodeHasDynamicAttribute(node);

                    // Allocate a target entry to this element.
                    element.isTarget = hasEventHandlers || hasDynamicAttribute;

                    if (element.isTarget) {
                        targetId = contextBlock.targetElementCount;
                        contextBlock.targetElementCount++;
                    }
                }

                if (hasEventHandlers) {
                    handleCreateBlockEventsExpression(contextBlock, targetId, node, process);
                }

                handleCreateElementEffectsEntryExpression(contextBlock, targetId, node, element);

                //console.log('-------------');
                if (node.children.length > 0) {
                    let children = _cleanChildren(node.children);

                    children.map(childNode => {
                        processJSX(childNode, element, contextBlock);
                    });
                }

                prepElement(element);
                //console.log('EL children', element.children);

                if (isNewBlockEnclosingElement) {
                    return createCallBlockExpression(contextBlock);
                } else {
                    return null;
                }

            } else { // is user component

                let props = {};

                node.openingElement.attributes.forEach(attribute => {
                    // if the prop does not have a value
                    // example: <MyComponent myProp />
                    if (!attribute.value) {
                        // assign true to the prop
                        props[attribute.name.name] = {
                            "type": "BooleanLiteral",
                            "value": true
                        };
                    } else if (attribute.value.type == 'StringLiteral' || attribute.value.type == 'NumericLiteral') {
                        // check if attribute.value is a stringliteral or numericliteral
                        // if so, just add it to the props object
                        // if not, add it to the props object as an expression
                        props[attribute.name.name] = attribute.value;
                    } else {
                        props[attribute.name.name] = attribute.value.expression;
                    }
                })

                if (node.children.length > 0) {
                    let children = _cleanChildren(node.children);

                    if (children.length > 1) {
                        props['children'] = {
                            "type": "ArrayExpression",
                            "elements": children.map(child => {
                                return processJSX(child, null, null);
                            })
                        };
                    } else {
                        let child = children[0];

                        let childProcessed;

                        if (child.type == 'JSXExpressionContainer') {
                            childProcessed = process(child.expression);
                        } else {
                            childProcessed = processJSX(child, null, null);
                        }

                        props['children'] = childProcessed;
                    }
                }

                let createComponentExpression = createCreateComponentExpression(node.openingElement.name, props, process);

                if (!isNewBlockEnclosingElement) {
                    // add new anchor to the currently active UI block
                    let anchorIndex = contextBlock.anchors.length;

                    contextBlock.anchors.push(createComponentExpression);
                    parentElement.children.push({ type: '$anchor', value: anchorIndex });

                    return node;
                } else {
                    return createComponentExpression;
                }
            }
        } else if (node.type == 'JSXText') {

            let trimmedValue = node.value.replace(/\s\s+/g, ' ');

            if (trimmedValue == '') {
                throw new Error();
            }

            let isNewBlockEnclosingElement = parentElement == null;

            if (isNewBlockEnclosingElement) {

                let contextBlock = {
                    id: createNewBlockId(),
                    rootElement: { type: '$text', value: trimmedValue },
                    anchors: [],
                    targetElementCount: 0,
                    eventHandlers: [],
                    styleEffects: []
                };

                gatheredUIBlocks.push(contextBlock);

                return createCallBlockExpression(contextBlock);
            } else {
                parentElement.children.push({ type: '$text', value: trimmedValue });
                return null;
            }

        } else if (node.type == 'JSXExpressionContainer') {

            let anchorExpression = process(node.expression);

            // if the expression is an identifier, we'll do nothing
            // if it isn't, then there's special handling to do
            if (node.expression.type != 'Identifier') {

                if (node.expression.type == 'ConditionalExpression') {
                    let testExpression = node.expression.test;

                    anchorExpression = {
                        type: 'ArrowFunctionExpression',
                        params: [],
                        body: {
                            "type": "BlockStatement",
                            body: [
                                {
                                    "type": "VariableDeclaration",
                                    declarations: [
                                        {
                                            "type": "VariableDeclarator",
                                            "id": {
                                                "type": "Identifier",
                                                "name": "_c"
                                            },
                                            "init": {
                                                "type": "CallExpression",
                                                "callee": {
                                                    "type": "Identifier",
                                                    "name": "useMemo"
                                                },
                                                "arguments": [
                                                    {
                                                        "type": "ArrowFunctionExpression",
                                                        "params": [],
                                                        "body": testExpression
                                                    }
                                                ]
                                            }
                                        }
                                    ],
                                    "kind": "let"
                                },
                                {
                                    "type": "ReturnStatement",
                                    "argument": {
                                        "type": "ConditionalExpression",
                                        "test": {
                                            "type": "CallExpression",
                                            "callee": {
                                                "type": "Identifier",
                                                "name": "_c"
                                            },
                                            "arguments": []
                                        },
                                        "consequent": processJSX(node.expression.consequent),
                                        "alternate": processJSX(node.expression.alternate)
                                    }
                                }
                            ]
                        }
                    };
                } else {
                    anchorExpression = {
                        "type": "ArrowFunctionExpression",
                        "params": [],
                        "body": anchorExpression
                    };
                }
            }

            if (contextBlock) {
                let anchorIndex = contextBlock.anchors.length;

                contextBlock.anchors.push(anchorExpression);

                parentElement.children.push({ type: '$anchor', value: anchorIndex });
                return null;
            } else {
                return anchorExpression;
            }


        } else {
            return process(node);
        }
    }

    function process(node) {

        // TODO: we probably need to move to the visitor pattern here

        if (node.type == 'File') {
            node.program = process(node.program);
            return node;
        } else if (node.type == 'Program') {
            let lastImportStatementIndex;

            node.body.map((bodyNode, index) => {

                if (bodyNode.type == 'ImportDeclaration') {
                    lastImportStatementIndex = index;
                }

                node.body[index] = process(bodyNode);
            });

            let encodeCompressionMap = getEncodeCompressionMap();

            gatheredUIBlocks.forEach((block, index) => {
                node.body.splice(lastImportStatementIndex + 1 + index, 0, createDeclareBlockExpression(block, encodeCompressionMap));
            });

            gatheredClientFunctions.forEach((clientFunction, index) => {
                node.body.splice(lastImportStatementIndex + 1 + index, 0, createDeclareClientFunctionExpression(clientFunction));
            });


            node.body.splice(lastImportStatementIndex + 1, 0, createCompilerInternalImportsExpression());


            return node;
        } else if (node.type == 'IfStatement') {
            node.consequent = process(node.consequent);
            node.test = process(node.test);

            if (node.alternate) {
                node.alternate = process(node.alternate);
            }

            return node;
        } else if (node.type == 'ExportDefaultDeclaration') {
            node.declaration = process(node.declaration);

            return node;
        } else if (node.type == 'ExportNamedDeclaration') {
            node.declaration = process(node.declaration);

            return node;
        } else if (node.type == 'FunctionDeclaration') {
            node.body = process(node.body);

            return node;
        } else if (node.type == 'BlockStatement') {
            node.body.map((bodyNode, index) => {
                node.body[index] = process(bodyNode);
                //console.log('========');
            });
            return node;
        } else if (node.type == 'ReturnStatement') {

            if (node.argument) {
                //console.log('ReturnStatement', node.argument.type);
                node.argument = process(node.argument);
            }

            return node;
        } else if (node.type == 'JSXText') {
            throw new Error('JSXText happens outside processJSX');
        } else if (node.type == 'JSXExpressionContainer') {
            throw new Error('JSXExpressionContainer happens outside processJSX');
        } else if (node.type == 'JSXFragment') {
            return processJSX(node, null, null);
        } else if (node.type == 'JSXElement') {
            return processJSX(node, null, null);
        } else if (node.type == 'CallExpression') {

            // if the function name is runOnClient, then we'll need to do some special handling
            if (node.callee.type == 'Identifier' && node.callee.name == '$c') {

                // assign a unique ID to this client function
                let clientFunctionId = createNewClientFunctionId();

                // node.arguments[0] is the function called within $c((arg1, arg2) => {...})
                let cParsed = parse$CDefinition(node.arguments[0]);

                let clientFunction = {
                    id: clientFunctionId,
                    argNames: cParsed.argNames,
                    body: cParsed.body
                };

                // get the first argument, which is the function to run
                gatheredClientFunctions.push(clientFunction);

                // rewrite the CallExpression node to an object
                // example: { clientFnId: 3 }
                node.type = 'ObjectExpression';

                let props = [
                    {
                        type: 'ObjectProperty',
                        key: {
                            type: 'Identifier',
                            name: 'clientFnId'
                        },
                        value: {
                            type: 'NumericLiteral',
                            value: clientFunctionId
                        }
                    }
                ];

                if (cParsed.serverBindNodes.length > 0) {
                    props.push({
                        type: 'ObjectProperty',
                        key: {
                            type: 'Identifier',
                            name: 'serverBindFns'
                        },
                        value: {
                            type: 'ArrayExpression',
                            elements: cParsed.serverBindNodes
                        }
                    })
                }

                node.properties = props;
            } else {
                node.arguments.map((bodyNode, index) => {
                    node.arguments[index] = process(bodyNode);
                });
            }

            return node;

        } else if (node.type == 'ArrowFunctionExpression') {
            node.body = process(node.body);
            return node;
        } else if (node.type == 'SwitchStatement') {

            for (let i = 0; i < node.cases.length; i++) {
                node.cases[i] = process(node.cases[i]);
            }

            return node;
        } else if (node.type == 'SwitchCase') {
            if (node.test) {
                node.test = process(node.test);
            }

            for (let i = 0; i < node.consequent.length; i++) {
                node.consequent[i] = process(node.consequent[i]);
            }

            return node;
        } else if (node.type == 'LogicalExpression') {
            node.left = process(node.left);
            node.right = process(node.right);
            return node;
        } else if (node.type == 'OptionalCallExpression') {
            // do we need to process the callee?
            //node.callee = process(node.callee);
            node.arguments.map((bodyNode, index) => {
                node.arguments[index] = process(bodyNode);
            });

            return node;
        } else if (node.type == 'ExpressionStatement') {
            node.expression = process(node.expression);
            return node;
        } else if (node.type == 'ObjectExpression') {
            node.properties.map((bodyNode, index) => {
                node.properties[index] = process(bodyNode);
            });
            return node;
        } else if (node.type == 'ObjectProperty') {
            node.value = process(node.value);
            return node;
        } else if (node.type == 'AssignmentExpression') {
            node.right = process(node.right);
            return node;
        } else if (node.type == 'VariableDeclaration') {
            node.declarations.forEach((decl, index) => {
                node.declarations[index] = process(decl);
            });
            return node;
        } else if (node.type == 'VariableDeclarator') {

            if (node.init) {
                node.init = process(node.init);
            }
            return node;
        }
        // handle class and its methods
        else if (node.type == 'ClassDeclaration') {
            node.body.body.forEach((method, index) => {
                node.body.body[index] = process(method);
            });
            return node;
        } else if (node.type == 'ClassMethod') {
            node.body = process(node.body);
            return node;
        } else if (node.type == 'ClassProperty') {
            node.value = process(node.value);
            return node;

        } else if (node.type == 'ConditionalExpression') {
            node.test = process(node.test);
            node.consequent = process(node.consequent);
            node.alternate = process(node.alternate);
            return node;

        }

        else if (node.type == 'ArrayExpression') {

            node.elements.forEach((element, index) => {
                node.elements[index] = process(element);
            });

            return node;

        } else {
            //console.log('unknown node', node.type);
            return node;
        }
    }

    process(parsed);

    let code = generate(parsed).code;

    return code;
}


function parse$CDefinition(functionNode) {
    // TODO: create a faster implementation that does not implementing print-ing and re-parsing
    // the $c source code
    let functionNodeString = generate(functionNode).code;
    let newFunctionAst = parser.parse(functionNodeString);

    let serverBindNodes = [];

    traverse.default(newFunctionAst, {
        CallExpression: function (path) {

            if (path.node.callee.type == 'Identifier' && path.node.callee.name == '$s') {
                serverBindNodes.push(path.node.arguments[0]);

                // replace it with a this.serverFunctions[id] call
                path.replaceWith({
                    type: 'MemberExpression',
                    object: {
                        type: 'MemberExpression',
                        object: {
                            type: 'ThisExpression'
                        },
                        property: {
                            type: 'Identifier',
                            name: 'serverFunctions'
                        }
                    },
                    property: {
                        type: 'NumericLiteral',
                        value: serverBindNodes.length - 1
                    }
                });
            }
        },
    });

    // tranform the argument signature into a list of argument names
    let argNames = functionNode.params.map((param) => {
        return param.name;
    });

    // fetch the first function node from the program AST
    let functionNodeAst = newFunctionAst.program.body[0].expression.body;

    let newFunctionBodyString = generate(functionNodeAst).code;

    return {
        body: newFunctionBodyString,
        argNames,
        serverBindNodes
    }
}

function handleCreateBlockEventsExpression(contextBlock, targetId, node, process) {
    eventNames.forEach(eventName => {
        let eventAttribute = getAttribute(node, eventName);

        if (eventAttribute) {
            let fnExpression = eventAttribute.expression;
            contextBlock.eventHandlers.push(createBlockEventHandlerEntryExpression(targetId, eventTypeIdMap[eventName], process(fnExpression)));
        }
    });
}

function _buildStyleConditionKeyExpression(cond) {
    return { type: "StringLiteral", value: cond.key };

    /*
    // Disable this for now, since it is making debug harder while the framework isn't too mature yet.

    if (condType == 'style' || condType == 'attribute') {
        let set = condType == 'style' ? compressionRegistry.stylePropertyKeys : compressionRegistry.elementAttributeNames;

        if (set.has(cond.key)) {
            let keysList = Array.from(set);
            return { type: 'NumericLiteral', value: keysList.indexOf(cond.key) + 1 };
        } else {
            //console.log('cond.key', cond.key, set);
            throw new Error();
        }
    } else {
        return { type: "StringLiteral", value: cond.key };
    }
    */
}

function _buildStyleConditionValueExpression(cond) {

    if (cond.type == 'classList') {
        return {
            type: "UnaryExpression",
            operator: "!",
            prefix: true,
            argument: {
                type: "UnaryExpression",
                operator: "!",
                prefix: true,
                argument: cond.condition
            }
        };
    }

    let condition = cond.condition;

    // TODO: handle style creations that are not in the static compression map

    // a == b ? ... : ... ;
    if (condition.type == 'ConditionalExpression' && condition.test.type == 'BinaryExpression') {
        // useMemo(() => a == b)() ? ... : ...;
        condition.test = {
            type: 'CallExpression',
            callee: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'useMemo' },
                arguments: [{ type: 'ArrowFunctionExpression', params: [], body: condition.test }]
            },
            arguments: []
        };

        return condition;
    }

    return condition;
}

function _buildElRefCallExpression(cond, _arguments) {

    let functionName = {
        'attribute': 'setAttribute',
        'style': 'setStyleProperty',
        'multiStyleProp': 'setMultiStyleProperties',
        'classList': 'toggleClass',
        'class': 'setClassName'
    }[cond.type];

    return {
        type: 'CallExpression',
        callee: {
            type: 'MemberExpression',
            object: {
                type: 'Identifier',
                name: 'elRef'
            },
            property: {
                type: 'Identifier',
                name: functionName
            }
        },

        arguments: _arguments
    }
}

function createMultiConditionStyleEffectBodyBlockStatement(styleConditions) {

    let body = [];

    body.push({
        type: "VariableDeclaration",
        kind: "const",
        declarations: styleConditions.map((cond, index) => {
            return {
                type: 'VariableDeclarator',
                id: {
                    type: 'Identifier', name: `_v$${index}`,
                },
                init: _buildStyleConditionValueExpression(cond)
            }
        })
    });

    function buildValueAssignmentExpression(index) {
        return {
            type: 'AssignmentExpression',
            operator: '=',
            left: {
                type: 'MemberExpression',
                object: { type: 'Identifier', name: '_p$' },
                property: { type: 'Identifier', name: `_v$${index}` }
            },
            right: { type: 'Identifier', name: `_v$${index}` }
        }
    }

    styleConditions.forEach((cond, index) => {
        // _v$2 !== _p$._v$2 && elRef.toggleClass("selected", _p$._v$ = _v$);
        let _arguments;
        let conditionType = cond.type;

        if (conditionType == 'class' || conditionType == 'multiStyleProp') {
            _arguments = [buildValueAssignmentExpression(index)];
        } else {
            // TODO: handle style creations that are not in the static compression map
            _arguments = [
                _buildStyleConditionKeyExpression(cond),
                buildValueAssignmentExpression(index)
            ];
        }

        body.push({
            type: 'ExpressionStatement',
            expression: {
                type: 'LogicalExpression',
                operator: '&&',
                left: {
                    type: 'BinaryExpression',
                    operator: '!==',
                    left: { type: 'Identifier', name: `_v$${index}` },
                    right: {
                        type: 'MemberExpression',
                        object: { type: 'Identifier', name: '_p$' },
                        property: { type: 'Identifier', name: `_v$${index}` }
                    }
                },
                right: _buildElRefCallExpression(cond, _arguments)
            }
        })
    });

    body.push({
        type: 'ReturnStatement',
        argument: {
            type: 'Identifier',
            name: '_p$'
        }
    })

    return {
        type: "BlockStatement",
        body: body
    };
}

function createSingleConditionStyleEffectBodyBlockStatement(styleCondition) {

    let _arguments;
    let conditionType = styleCondition.type;

    // if a single parameter function call (e.g. toggleClass, setMultiStyleProps)
    if (conditionType == 'class' || conditionType == 'multiStyleProp') {
        _arguments = [_buildStyleConditionValueExpression(styleCondition)];
    } else {

        // TODO: handle style creations that are not in the static compression map
        _arguments = [
            _buildStyleConditionKeyExpression(styleCondition),
            _buildStyleConditionValueExpression(styleCondition)
        ];
    }

    return {
        type: "BlockStatement",
        body: [_buildElRefCallExpression(styleCondition, _arguments)]
    };
}

function camelCaseToDash(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function handleCreateElementEffectsEntryExpression(contextBlock, targetId, node, element) {

    let styleConditions = []; // { type: 'classList', key: 'selected', condition: expression }
    let attributes = node.openingElement.attributes;

    // TODO: let's clean attribute handling up
    for (let i = 0; i < attributes.length; i++) {
        let attr = attributes[i];
        let attrName = attr.name.name;

        if (eventNamesSet.has(attrName)) {
            continue;
        }

        if (attr.name.name == 'classList') {
            let value = attr.value.expression;
            let classNameProps = value.properties;

            for (let j = 0; j < classNameProps.length; j++) {
                let prop = classNameProps[j];
                styleConditions.push({ type: 'classList', key: prop.key.name, condition: prop.value });
            }
        } else if (attr.name.name == 'style') {
            let value = attr.value;

            function processStyleObject(objectExpression) {
                let staticStyleStringables = [];

                // handle style={{ color: 'red', ... }} style initialization
                if (objectExpression.type == 'ObjectExpression') {
                    objectExpression.properties.forEach(prop => {

                        let key;

                        if (prop.key.type == 'Identifier') {
                            key = camelCaseToDash(prop.key.name);
                        } else if (prop.key.type == 'StringLiteral') {
                            key = prop.key.value;
                        }

                        compressionRegistry.stylePropertyKeys.add(key);

                        if (prop.value.type == 'StringLiteral' || prop.value.type == 'NumericLiteral') {

                            let valueString = prop.value.value.toString();
                            compressionRegistry.stylePropertyValues.add(valueString);

                            element.style.push([key, valueString]);

                            staticStyleStringables.push(`${key}:${prop.value.value}`);
                        } else {
                            styleConditions.push({ type: 'style', key, condition: prop.value });
                        }

                    });


                    element.attributes.style = staticStyleStringables.join(';');
                } else {
                    // handle dynamic style initialization
                    styleConditions.push({ type: 'multiStyleProp', condition: objectExpression });
                }
            }

            if (value.type == 'StringLiteral') {
                // disable support for style string attribute for now
            } else if (value.type == 'JSXExpressionContainer') {
                processStyleObject(value.expression);
            } else {
                throw new Error();
            }

        } else if (attr.name.name == 'class') {
            let value = attr.value;

            if (value.type == 'StringLiteral') {
                element.attributes.class = value.value;
            } else if (value.type == 'JSXExpressionContainer') {
                styleConditions.push({ type: 'class', condition: value.expression });
            }
        } else {
            let value = attr.value;
            compressionRegistry.elementAttributeNames.add(attrName);

            if (value.type == 'StringLiteral') {
                element.attributes[attrName] = value.value;
            } else if (value.type == 'JSXExpressionContainer') {
                styleConditions.push({ type: 'attribute', key: attrName, condition: value.expression });
            }
        }
    }

    if (styleConditions.length == 0) {
        return;
    }

    let isMultiConditionStyleEffect = styleConditions.length > 1;

    let fnExpression = {
        type: "ObjectMethod",
        method: true,
        key: { type: "Identifier", name: "effectFn" },
        params: isMultiConditionStyleEffect ?
            [{ type: "Identifier", name: "elRef" }, { type: "Identifier", name: "_p$" }] :
            [{ type: "Identifier", name: "elRef" }],
        id: null,
        kind: "method",
        computed: false,
        body: isMultiConditionStyleEffect ?
            createMultiConditionStyleEffectBodyBlockStatement(styleConditions) :
            createSingleConditionStyleEffectBodyBlockStatement(styleConditions[0])
    }

    let props = [
        {
            "type": "ObjectProperty",
            "key": {
                "type": "Identifier",
                "name": "targetId"
            },
            "value": {
                "type": "NumericLiteral",
                "value": targetId
            }
        },
        fnExpression
    ];

    if (isMultiConditionStyleEffect) {
        props.push({
            "type": "ObjectProperty",
            "key": {
                "type": "Identifier",
                "name": "init"
            },
            "value": {
                "type": "ObjectExpression",
                "properties": styleConditions.map((cond, index) => {
                    return {
                        "type": "ObjectProperty",
                        "key": {
                            "type": "Identifier",
                            "name": `_v$${index}`,
                        },
                        value: {
                            "type": "Identifier",
                            "name": "undefined",
                        }
                    }
                })
            }
        });
    }

    contextBlock.styleEffects.push({
        "type": "ObjectExpression",
        "properties": props
    });
}

function createCallBlockExpression(block) {

    let arguments_ = [{
        "type": "Identifier",
        "name": block.id.toString()
    }];

    arguments_.push(block.anchors.length > 0 ? {
        "type": "ArrayExpression",
        "elements": block.anchors || []
    } : { type: "NullLiteral" });

    arguments_.push(block.eventHandlers.length > 0 ? {
        "type": "ArrayExpression",
        "elements": block.eventHandlers
    } : { type: "NullLiteral" });


    arguments_.push(block.styleEffects.length > 0 ? {
        "type": "ArrayExpression",
        "elements": block.styleEffects
    } : { type: "NullLiteral" });

    return {
        "type": "CallExpression",
        "callee": {
            "type": "Identifier",
            "name": "_createBlock"
        },
        "arguments": arguments_
    }
}

function createBlockEventHandlerEntryExpression(targetId, type, fnExpression) {

    //console.log('createBlockEventHandlerEntryExpression', targetId, type);

    /*
    // if classList, then wrap the class object expression in a function.
    if (type == 5) {
        fnExpression = {
            "type": "ArrowFunctionExpression",
            "params": [],
            "body": fnExpression
        }
    }
    */

    return {
        "type": "ObjectExpression",
        "properties": [
            {
                "type": "ObjectProperty",
                "key": {
                    "type": "Identifier",
                    "name": "targetId"
                },
                "value": {
                    "type": "NumericLiteral",
                    "value": targetId
                }
            },
            {
                "type": "ObjectProperty",
                "key": {
                    "type": "Identifier",
                    "name": "type"
                },
                "value": {
                    "type": "NumericLiteral",
                    "value": type
                }
            },
            {
                "type": "ObjectProperty",
                "key": {
                    "type": "Identifier",
                    "name": "fn"
                },
                "value": fnExpression
            },

        ]
    }
}

function createCreateComponentExpression(componentIdentifier, props, process) {

    let arguments_ = [componentIdentifier];

    if (Object.keys(props).length) {

        let props_ = {
            "type": "ObjectExpression",
            "properties": Object.keys(props).map(propKey => {

                let propExpression = props[propKey];

                /*
                if (propExpression.type == 'Identifier') {

                    //console.log('propExpression standard', propExpression);

                    return {
                        "type": "ObjectProperty",
                        "key": {
                            "type": "Identifier",
                            "name": propKey
                        },
                        "value": process(propExpression)
                    };
                } else 
                
                */
                if (propExpression.type == 'ArrowFunctionExpression') {
                    return {
                        "type": "ObjectProperty",
                        "key": {
                            "type": "Identifier",
                            "name": propKey
                        },
                        "value": process(propExpression)
                    };
                } else {
                    // Wrap expressions that are not bare identifier or function.

                    let body;

                    // handle binary expression specially -- memo-wrap them
                    if (propExpression.type == 'BinaryExpression') {
                        body = [
                            {
                                type: 'VariableDeclaration',
                                kind: 'let',
                                declarations: [
                                    {
                                        "type": "VariableDeclarator",

                                        id: { type: "Identifier", name: "_c" },
                                        init: {
                                            type: 'CallExpression',
                                            callee: { type: 'Identifier', name: 'useMemo' },
                                            arguments: [{ type: 'ArrowFunctionExpression', params: [], body: process(propExpression) }]
                                        }
                                    }]
                            },
                            {
                                "type": "ReturnStatement",
                                "argument": {
                                    type: 'CallExpression',
                                    callee: { type: 'Identifier', name: '_c' },
                                    arguments: []
                                }
                            }
                        ]
                    } else {
                        body = [
                            { "type": "ReturnStatement", "argument": process(propExpression) }
                        ]
                    }

                    return {
                        "type": "ObjectMethod",
                        "kind": "get",
                        "key": {
                            "type": "Identifier",
                            "name": propKey
                        },
                        "method": false,
                        "id": null,
                        "params": [],
                        "body": {
                            "type": "BlockStatement",
                            "body": body
                        }
                    };
                }
            })
        };

        arguments_.push(props_);
    } else {
        // create empty object expression
        let prop = {
            "type": "ObjectExpression",
            "properties": []
        };

        arguments_.push(prop);
    }

    return {
        "type": "CallExpression",
        "callee": {
            "type": "Identifier",
            "name": "_createComponent"
        },
        "arguments": arguments_
    }
}

function prepElement(element) {

    // TODO: still need to handle two signals that are not spaced to each other
    // example: {signal1}{signal2}
    // this current does not work and signal1 will appear after signal2 in the DOM.

    let before = element.children.map(c => [c.type, c.value])
    let hasPrecedingAnchor = false;
    let i = 0;

    while (i < element.children.length) {

        let childEl = element.children[i];

        if (childEl.type == '$anchor') {
            hasPrecedingAnchor = true;
            i++;
            //precedingAnchorIndex = index;
        } else if (childEl.type == '$text') {

            if (hasPrecedingAnchor) {
                // insert comment
                element.children.splice(i, 0, { type: '$text', value: '<!>' });
                hasPrecedingAnchor = false;
                i += 2;
            } else {
                i++;
            }

        } else {
            hasPrecedingAnchor = false;
            i++;
        }
    }

    if (before.length != element.children.length) {
        //console.log('prepElement ', bef, '=>', element.children.map(c => [c.type, c.value]));
    }
}

function replaceNewlinesWithSpace(str) {
    // Use the replace method to replace all newline characters with a
    // single space character
    return str.replace(/\r?\n/g, " ");
}
function replaceMultipleSpacesWithSingleSpace(str) {
    // Use the replace method to replace multiple consecutive space
    // characters with a single space character
    return str.replace(/\s+/g, " ");
}
function trimLeft(str) {
    // Use a regular expression to match any whitespace characters at the
    // beginning of the string, and then use the replace method to remove
    // them
    return str.replace(/^\s+/, "");
}
function trimRight(str) {
    return str.replace(/\s+$/, '');
}

function _cleanChildren(children) {


    children.forEach(childNode => {

        if (childNode.type == 'JSXText') {
            //childNode.value = replaceNewlinesAndSpaces(childNode.value);//.replace(/\s/g, '') != '';
            //let str = childNode.value;
            let newValue = replaceMultipleSpacesWithSingleSpace(replaceNewlinesWithSpace(childNode.value));//.replace(/\s/g, '') != '';;//isAllWhitespace(str) && hasNewline(str) ? '' : replaceNewlinesAndSpaces(childNode.value);
            childNode.value = newValue;
            //console.log('childNode', JSON.stringify(childNode.value), '=>', JSON.stringify(newValue), newValue != '');
        }
    });

    if (children[0].type == 'JSXText') {
        children[0].value = trimLeft(children[0].value);
    }

    if (children[children.length - 1].type == 'JSXText') {
        children[children.length - 1].value = trimRight(children[children.length - 1].value);
    }

    let filtered = children.filter(childNode => {

        if (childNode.type == 'JSXText') {
            //return childNode.value.replace(/\s/g, '') != '';
            return childNode.value != '';
        }

        return true;
    });


    /*
    if (filtered.length == 1) {
        filtered[0].value == '';
    }
    */

    //console.log();

    /*
    if (filtered.length == 1 && filtered[0].type == 'JSXText') {
        console.log(JSON.stringify(filtered[0].value));
    }
    */

    return filtered.length == 1 && filtered[0].value == '' ? [] : filtered;
}
