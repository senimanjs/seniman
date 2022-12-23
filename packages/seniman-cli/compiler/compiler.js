import parser from "@babel/parser";
import generator from "@babel/generator";
import fs from 'fs';
import path from 'path';

import { createDeclareBlockExpression } from "./declare.js";

let generate = generator.default;

let lastBlockId = 3000;

function createNewBlockId() {
    lastBlockId++;
    return lastBlockId;
}

const eventTypeIdMap = {
    'onClick': 1,
    'onBlur': 2,
    'onFocus': 3,
    'onValueChange': 4,
    'onScroll': 5
};

const eventNames = Object.keys(eventTypeIdMap);

const styleAttributeNames = ['classList', 'style', 'class'];

const validHtmlElementNames = new Set([
    'div',
    'span',
    'input',
    'img',
    'p',
    'a',
    'hr',
    'button',
    'select',
    'option',
    'meta',
    'style',
    'title'
]);

const validElementAttributeNames = new Set([
    'style',
    'class',
    'href',
    'type',
    'src',
    'value',
    'autocapitalize',
    'onclick',
    'id',
    'name',
    'content',
    'placeholder'
]);

const compressionRegistry = {
    elementNames: new Set(),
    elementAttributeNames: validElementAttributeNames, // new Set()
    stylePropertyKeys: new Set(),
    stylePropertyValues: new Set()
}

export function getCompiledCompressionMap() {

    let buf = Buffer.alloc(32678); //1 + 2 + bufContentLength);
    let ptr = 0;

    compressionRegistry.elementNames.forEach(name => {
        buf.writeUint8(name.length, ptr);
        buf.write(name, ptr + 1, name.length);

        ptr += (1 + name.length);
    });

    buf.writeUint8(0, ptr);
    ptr += 1;

    compressionRegistry.elementAttributeNames.forEach(name => {
        buf.writeUint8(name.length, ptr);
        buf.write(name, ptr + 1, name.length);

        ptr += (1 + name.length);
    });

    buf.writeUint8(0, ptr);
    ptr += 1;

    compressionRegistry.stylePropertyKeys.forEach(name => {
        buf.writeUint8(name.length, ptr);
        buf.write(name, ptr + 1, name.length);

        ptr += (1 + name.length);
    });

    buf.writeUint8(0, ptr);
    ptr += 1;

    compressionRegistry.stylePropertyValues.forEach(name => {
        buf.writeUint8(name.length, ptr);
        buf.write(name, ptr + 1, name.length);

        ptr += (1 + name.length);
    });

    buf.writeUint8(0, ptr);
    ptr += 1;


    //buf.writeUint16LE(ptr - 3, 1);

    return buf.subarray(0, ptr);
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
            let elementName = node.openingElement.name.name;
            let isHTMLElement = validHtmlElementNames.has(elementName);
            let isNewBlockEnclosingElement = parentElement == null;

            // is dom element
            if (isHTMLElement) {
                compressionRegistry.elementNames.add(elementName);

                let attributeNames = getAttributeNames(node);
                let hasAttributes = attributeNames.size > 0;
                let hasEventHandlers = hasAttributes && eventNameInAttributeNames(attributeNames);
                let hasStyling = hasAttributes && stylingAttributeInAttributeNames(attributeNames);

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

                    //let hasDynamicStyling = elementHasDynamicStyling(element);

                    // Allocate a target entry to this element.
                    // TODO: do better checking on this. 
                    // only need to target if element has *dynamic* styling, not static.
                    // TODO: REALLY fix this soon.. especially dynamic attribute value checking
                    element.isTarget = hasEventHandlers || hasStyling || attributeNames.has('value') || attributeNames.has('src');

                    if (element.isTarget) {
                        targetId = contextBlock.targetElementCount;
                        contextBlock.targetElementCount++;
                    }
                }

                if (hasEventHandlers) {
                    handleCreateBlockEventsExpression(contextBlock, targetId, node);
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
                    props[attribute.name.name] = attribute.value.expression;
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

                        props['children'] = processJSX(child, null, null);
                    }
                }

                let createComponentExpression = createCreateComponentExpression(node.openingElement.name.name, props, process);

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

            if (node.expression.type == 'CallExpression') {
                anchorExpression = {
                    "type": "ArrowFunctionExpression",
                    "params": [],
                    "body": anchorExpression
                };
            } else if (node.expression.type == 'ConditionalExpression') {
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
                                                "name": "createMemo"
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

            node.arguments.map((bodyNode, index) => {
                node.arguments[index] = process(bodyNode);
            });

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
        } else if (node.type == 'ExpressionStatement') {
            node.expression = process(node.expression);
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
        } else {
            //console.log('unknown node', node.type);
            return node;
        }
    }

    process(parsed);

    let code = generate(parsed).code;

    return code;
}


function handleCreateBlockEventsExpression(contextBlock, targetId, node) {
    eventNames.forEach(eventName => {
        let eventAttribute = getAttribute(node, eventName);

        if (eventAttribute) {
            let fnExpression = eventAttribute.expression;
            contextBlock.eventHandlers.push(createBlockEventHandlerEntryExpression(targetId, eventTypeIdMap[eventName], fnExpression));
        }
    });
}

function _buildStyleConditionKeyExpression(cond) {
    //console.log('cond.type', cond.type);
    let condType = cond.type;

    if (condType == 'style' || condType == 'attribute') {
        let set = condType == 'style' ? compressionRegistry.stylePropertyKeys : compressionRegistry.elementAttributeNames;

        //console.log()
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
        // createMemo(() => a == b)() ? ... : ...;
        condition.test = {
            type: 'CallExpression',
            callee: {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: 'createMemo' },
                arguments: [{ type: 'ArrowFunctionExpression', params: [], body: condition.test }]
            },
            arguments: []
        };

        return condition;
    }

    return condition;
}

function _buildElRefCallExpression(cond, _arguments) {
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
                name: { 'attribute': 'setAttribute', 'style': 'setStyleProperty', 'classList': 'toggleClass', 'class': 'setClassName' }[cond.type]
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

        if (cond.type == 'class') {
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

    if (styleCondition.type == 'class') {
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

let supportedAttrs = new Set(['href', 'src', 'type', 'value', 'autocapitalize', 'id', 'name', 'content', 'onclick']);

function handleCreateElementEffectsEntryExpression(contextBlock, targetId, node, element) {

    let styleConditions = []; // { type: 'classList', key: 'selected', condition: expression }
    let attributes = node.openingElement.attributes;

    // TODO: let's clean attribute handling up
    for (let i = 0; i < attributes.length; i++) {
        let attr = attributes[i];
        let attrName = attr.name.name;

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

                objectExpression.properties.forEach(prop => {

                    let key;

                    if (prop.key.type == 'Identifier') {
                        key = prop.key.name;
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
        } else if (supportedAttrs.has(attrName)) {
            let value = attr.value;

            if (value.type == 'StringLiteral') {
                element.attributes[attrName] = value.value;
            } else if (value.type == 'JSXExpressionContainer') {
                styleConditions.push({ type: 'attribute', key: attrName, condition: value.expression });
            }
        } else {
            //console.warn('Unsupported attribute', attrName);
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

    // if classList, then wrap the class object expression in a function.
    if (type == 5) {
        fnExpression = {
            "type": "ArrowFunctionExpression",
            "params": [],
            "body": fnExpression
        }
    }

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

function createCreateComponentExpression(componentName, props, process) {

    let arguments_ = [
        {
            "type": "Identifier",
            "name": componentName
        }
    ];

    if (Object.keys(props).length) {

        let props_ = {
            "type": "ObjectExpression",
            "properties": Object.keys(props).map(propKey => {

                let propExpression = props[propKey];

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
                } else if (propExpression.type == 'ArrowFunctionExpression') {
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
                                            callee: { type: 'Identifier', name: 'createMemo' },
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
