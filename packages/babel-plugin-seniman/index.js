var JSX = require("@babel/plugin-syntax-jsx").default;
var t = require('babel-types');

var { createDeclareBlockExpression } = require('./block-template');

const eventTypeIdMap = {
  'onClick': 1,
  'onFocus': 2,
  'onBlur': 3,
  'onChange': 4,
  'onScroll': 5,
  'onKeyDown': 6,
  'onKeyUp': 7,
  'onMouseEnter': 8,
  'onMouseLeave': 9
};

const eventNames = Object.keys(eventTypeIdMap);
const eventNamesSet = new Set(eventNames);
const styleAttributeNames = ['classList', 'style', 'class'];

function getAttributeNames(node) {
  let names = new Set();

  node.openingElement.attributes.forEach(attrNode => {
    names.add(attrNode.name.name);
  });

  return names;
}

function getAttribute(node, name) {
  let index = node.openingElement.attributes.findIndex(attrNode => attrNode.name.name == name);
  return index > -1 ? node.openingElement.attributes[index].value : null;
}

function eventNameInAttributeNames(names) {
  for (let i = 0; i < eventNames.length; i++) {
    if (names.has(eventNames[i])) {
      return true;
    }
  }

  return false;
}

function isStaticExpression(expression) {
  return expression.type == 'StringLiteral' || expression.type == 'NumericLiteral';
}

// ported from https://github.com/ryansolid/dom-expressions/blob/df1dd518216a9d11318d54d53144763ee1a97706/packages/babel-plugin-jsx-dom-expressions/src/shared/utils.js#L69
function isComponentTag(tagName) {
  return (
    (tagName[0] && tagName[0].toLowerCase() !== tagName[0]) ||
    tagName.includes(".") ||
    /[^a-zA-Z]/.test(tagName[0])
  );
}

function nodeHasDynamicAttribute(node) {
  let attributes = node.openingElement.attributes;

  for (let i = 0; i < attributes.length; i++) {
    let attr = attributes[i];
    let attrName = attr.name.name;
    let value = attr.value;

    if (attrName == 'style') {
      if (value.type == 'JSXExpressionContainer') {
        let expressionType = value.expression.type;

        if (expressionType == 'ObjectExpression') {
          // Only support ObjectExpression for now
          for (let j = 0; j < value.expression.properties.length; j++) {
            let prop = value.expression.properties[j];

            if (!isStaticExpression(prop.value)) {
              return true;
            }
          }
        } else {
          return true;
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


function handleCreateBlockEventsExpression(contextBlock, targetId, node) {
  eventNames.forEach(eventName => {
    let eventAttribute = getAttribute(node, eventName);

    if (eventAttribute) {
      let fnExpression = eventAttribute.expression;
      contextBlock.eventHandlers.push(createBlockEventHandlerEntryExpression(targetId, eventTypeIdMap[eventName], fnExpression));
    }
  });
}

function createBlockEventHandlerEntryExpression(targetId, type, fnExpression) {

  // sample:
  // {
  //   targetId: 1,
  //   type: 1,
  //   fn: () => {
  //     console.log('onClick');
  //   }
  // }

  // create object expression
  return t.objectExpression([
    t.objectProperty(t.identifier('targetId'), t.numericLiteral(targetId)),
    t.objectProperty(t.identifier('type'), t.numericLiteral(type)),
    t.objectProperty(t.identifier('fn'), fnExpression)
  ]);
}

function camelCaseToDash(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
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
  // NOTE: disable useMemo optimization for now 
  if (false) {//condition.type == 'ConditionalExpression' && condition.test.type == 'BinaryExpression') {
    // _useMemo$(() => a == b)() ? ... : ...;
    condition.test = {
      type: 'CallExpression',
      callee: {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: '_useMemo$' },
        arguments: [{ type: 'ArrowFunctionExpression', params: [], body: condition.test }]
      },
      arguments: []
    };

    return condition;
  }

  return condition;
}

function _buildStyleConditionKeyExpression(cond) {
  return { type: "StringLiteral", value: cond.key };
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

            //compressionRegistry.stylePropertyKeys.add(key);

            if (prop.value.type == 'StringLiteral' || prop.value.type == 'NumericLiteral') {

              let valueString = prop.value.value.toString();
              //compressionRegistry.stylePropertyValues.add(valueString);

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
      //compressionRegistry.elementAttributeNames.add(attrName);

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

let contextBlock = null;
let componentStack = [];
let pendingBlockStack = [];

let moduleLevelLastBlockId = 0;
let moduleLevelLastClientFunctionId = 0;

function enterJSX(path) {

  let isHTMLElement = path.node.openingElement.name.type == 'JSXIdentifier' &&
    isComponentTag(path.node.openingElement.name.name) == false;
  let isNewBlockEnclosingElement = contextBlock == null;

  let node = path.node;

  if (isHTMLElement) {
    let elementName = node.openingElement.name.name;

    let attributeNames = getAttributeNames(node);
    let hasAttributes = attributeNames.size > 0;
    let hasEventHandlers = hasAttributes && eventNameInAttributeNames(attributeNames);

    let targetId;

    let parentElement = (contextBlock && contextBlock.__elementStack[contextBlock.__elementStack.length - 1]) || null;

    let element = {
      type: elementName,
      children: [],
      isTarget: false,
      style: [],
      attributes: {}
    };

    if (isNewBlockEnclosingElement) {
      contextBlock = {
        //id: moduleLevelLastBlockId,//createNewBlockId(),
        rootElement: element,
        anchors: [],
        targetElementCount: 0,
        eventHandlers: [],
        styleEffects: [],

        __elementStack: [element]
      }

      targetId = 255;
    } else {

      parentElement.children.push(element);

      contextBlock.__elementStack.push(element);

      // Allocate a target entry to this element.
      element.isTarget = hasEventHandlers || nodeHasDynamicAttribute(node);

      if (element.isTarget) {
        targetId = contextBlock.targetElementCount;
        contextBlock.targetElementCount++;
      }
    }

    if (hasEventHandlers) {
      handleCreateBlockEventsExpression(contextBlock, targetId, node);
    }

    handleCreateElementEffectsEntryExpression(contextBlock, targetId, node, element);

  } else {

    // if Component

    componentStack.push({
      name: node.openingElement.name,
      props: {}
    });

    pendingBlockStack.push(contextBlock);
    contextBlock = null;
  }

  /*
  <div>
    <div>{test}</div>
    <div>
      {list.map(item => <div>{item}</div>)}
    </div>
    <div>This is a test</div>
  </div>
  */
}

function exitJSX(path) {
  let isHTMLElement = path.node.openingElement.name.type == 'JSXIdentifier' &&
    isComponentTag(path.node.openingElement.name.name) == false;

  if (isHTMLElement) {
    contextBlock.__elementStack.pop();

    if (contextBlock.__elementStack.length == 0) {

      moduleLevelLastBlockId++;

      let blockId = moduleLevelLastBlockId;

      insertBlockStatement(path, contextBlock, blockId);

      path.replaceWith(
        t.callExpression(
          t.identifier('_createBlock'),
          [
            t.identifier(`_b$${blockId}`),
            // list of expressions contained in contextBlock.anchors
            t.arrayExpression(contextBlock.anchors),
            // list of expressions contained in contextBlock.eventHandlers
            t.arrayExpression(contextBlock.eventHandlers),
            // list of expressions contained in contextBlock.styleEffects
            t.arrayExpression(contextBlock.styleEffects)
          ]
        )
      );

      contextBlock = null;
    }

  } else { // if is closing to a Component

    let component = componentStack.pop();

    //console.log('component props', component.props, path.node.children);

    contextBlock = pendingBlockStack.pop();

    // wrap the expression in a single-expression arrow function
    // example:
    // () => test()
    contextBlock.anchors.push(createCreateComponentExpression(component.name, component.props, path.node.children));

    // push the component as anchor
    let parentElement = getActiveParentElement();
    let anchorIndex = contextBlock.anchors.length;

    parentElement.children.push({ type: '$anchor', value: anchorIndex });
  }

}

function insertBlockStatement(path, block, blockId) {

  const programPath = getProgramPath(path);

  // create a new _declareBlock function call
  // example:
  // let $block1 = _declareBlock();
  // 1 is the block id

  const blockDeclaration = createDeclareBlockExpression(blockId, block);

  let lastImportIndex = 0;

  // Find the last import statement in the program body
  for (let i = 0; i < programPath.node.body.length; i++) {
    if (programPath.node.body[i].type === 'ImportDeclaration') {
      lastImportIndex = i;
    } else {
      break;
    }
  }

  if (lastImportIndex >= 0) {
    // Insert the new node after the last import statement
    programPath.get('body')[lastImportIndex].insertAfter(blockDeclaration);
  } else {
    // If no import statement is found, insert the new node at the beginning of the program body
    programPath.get('body')[0].insertBefore(blockDeclaration);
  }
}

function getProgramPath(path) {
  let parentPath = path.parentPath;

  while (parentPath) {
    if (parentPath.isProgram()) {
      return parentPath;
    }

    parentPath = parentPath.parentPath;
  }
}

function enterJSXEpression(path) {

  if (path.parentPath.isJSXElement()) {
    pendingBlockStack.push(contextBlock);
    contextBlock = null;
  }
}

function exitJSXExpression(path) {
  if (path.parentPath.isJSXAttribute() && isComponentTag(path.parentPath.parentPath.node.name.name)) {
    componentStack[componentStack.length - 1].props[path.parentPath.node.name.name] = path.node.expression;
  } else if (path.parentPath.isJSXElement()) {

    // check if the JSXExpressionContainer is a child of a JSXElement

    // if it is, then we need to wrap the expression in a single-expression arrow function
    // re-activate the wrapping block from the stack
    contextBlock = pendingBlockStack.pop();

    // wrap the expression in a single-expression arrow function
    // example:
    // () => test()
    contextBlock.anchors.push(t.arrowFunctionExpression(
      [],
      path.node.expression
    ));

    let parentElement = getActiveParentElement();
    let anchorIndex = contextBlock.anchors.length;

    parentElement.children.push({ type: '$anchor', value: anchorIndex });
  }
}

function getActiveParentElement() {
  return contextBlock.__elementStack[contextBlock.__elementStack.length - 1];
}

function enterJSXText(path) {
  if (contextBlock) {
    let parentElement = getActiveParentElement();
    parentElement.children.push({ type: '$text', value: path.node.value });
  } else {
    // remove the path
    path.remove();
  }
}

module.exports = function () {
  return {
    inherits: JSX,
    visitor: {
      Program: {
        enter(path) {
        },
        exit(path) {
          // add internal compiler imports
          path.node.body.unshift(createCompilerInternalImportsExpression())
        }
      },
      JSXElement: {
        enter: enterJSX,
        exit: exitJSX,
      },

      JSXExpressionContainer: {
        enter: enterJSXEpression,
        exit: exitJSXExpression
      },

      JSXText: enterJSXText
    },
  };
};


function createCreateComponentExpression(componentIdentifier, props, children) {

  if (Object.keys(props).length > 0) {

    propObject = {
      "type": "ObjectExpression",
      // loop through props and create a property for each
      "properties": Object.keys(props).map((key) => {
        return {
          "type": "ObjectMethod",
          "kind": "get",
          "key": {
            "type": "Identifier",
            "name": key
          },
          "params": [],
          "body": {
            "type": "BlockStatement",
            "body": [
              {
                "type": "ReturnStatement",
                "argument": props[key]
              }]
          }
        }
      })
    };

  } else {
    // create empty object expression
    propObject = {
      "type": "ObjectExpression",
      "properties": []
    };
  }

  propObject.properties.push({
    "type": "ObjectMethod",
    "kind": "get",
    "key": {
      "type": "Identifier",
      "name": "children"
    },
    "params": [],
    "body": {
      "type": "BlockStatement",
      "body": [
        {
          "type": "ReturnStatement",
          "argument": children.length > 1 ? {
            "type": "ArrayExpression",
            "elements": children
          } : children[0]
        }]
    }
  });

  let arguments_ = [componentIdentifier, propObject];

  return t.callExpression(
    t.identifier('_createComponent'),
    arguments_
  );
}

function createCompilerInternalImportsExpression() {

  let importDeclaration = {
    "type": "ImportDeclaration",
    "specifiers": [
      {
        "type": "ImportSpecifier",
        "local": {
          "type": "Identifier",
          "name": "_declareBlock"
        },
        "imported": {
          "type": "Identifier",
          "name": "_declareBlock"
        }
      },
      {
        "type": "ImportSpecifier",
        "local": {
          "type": "Identifier",
          "name": "_declareClientFunction"
        },
        "imported": {
          "type": "Identifier",
          "name": "_declareClientFunction"
        }
      },

      // create one for _createBlock
      {
        "type": "ImportSpecifier",
        "local": {
          "type": "Identifier",
          "name": "_createBlock"
        },
        "imported": {
          "type": "Identifier",
          "name": "_createBlock"
        }
      },

      // create one for _createComponent
      {
        "type": "ImportSpecifier",
        "local": {
          "type": "Identifier",
          "name": "_createComponent"
        },
        "imported": {
          "type": "Identifier",
          "name": "_createComponent"
        }
      },

      // add a useMemo import, rename it to _useMemo$
      {
        "type": "ImportSpecifier",
        "local": {
          "type": "Identifier",
          "name": "_useMemo$"
        },
        "imported": {
          "type": "Identifier",
          "name": "useMemo"
        }
      },

    ],
    "source": {
      "type": "StringLiteral",
      "value": "seniman"
    }
  };

  return importDeclaration;
}
