import t from '@babel/types';

export function createCompilerInternalImportsExpression(options) {
  const specifiers = [
    t.importSpecifier(t.identifier('_$createBlock'), t.identifier('_createBlock')),
    t.importSpecifier(t.identifier('_$createComponent'), t.identifier('_createComponent')),
    t.importSpecifier(t.identifier('_useMemo$'), t.identifier('useMemo')),
    t.importSpecifier(t.identifier('_$declareBlock'), t.identifier('_declareBlock')),
    t.importSpecifier(t.identifier('_$declareClientFunction'), t.identifier('_declareClientFunction'))
  ];

  return t.importDeclaration(
    specifiers,
    t.stringLiteral('seniman/_autogen/v1')
  );
}
export function createDeclareBlockExpression2(blockId, rootElement) {

  /*
    _declareBlock({
      version: '2.0',
      root: {
        type: 'div',
        target: true,
        style:  {'width': '100px', 'height': '100px'},
        class: ['mg-2', 'bg-red-500', 'text-white', 'rounded-lg', 'p-2', 'cursor-pointer'],
        children: [
          {type: '$text', text: 'Hello world'},
          {type: '$anchor', index: 0},
        ]
      }
    });
  */

  return t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier('_b$' + blockId.toString()),
      t.callExpression(
        t.identifier('_$declareBlock'),
        [
          t.objectExpression([
            t.objectProperty(
              t.identifier('v'),
              t.stringLiteral('2.0')
            ),
            t.objectProperty(
              t.identifier('root'),
              _createElementExpression(rootElement) // Assuming _createElementExpression is defined elsewhere
            )
          ])
        ]
      )
    )
  ]);
}

function _createElementExpression(element) {

  let exp = t.objectExpression([
    t.objectProperty(
      t.identifier('type'),
      t.stringLiteral(element.type)
    )
  ]);

  // add on target. if true, then add the property with value of true
  if (element.isTarget) {
    // console.log('isTarget', isTarget);
    exp.properties.push(
      t.objectProperty(
        t.identifier('target'),
        t.booleanLiteral(true)
      )
    );
  }

  if (element.type == '$text') {
    exp.properties.push(
      t.objectProperty(
        t.identifier('text'),
        t.stringLiteral(element.value)
      )
    );
  } else if (element.type == '$anchor') {
    // skip inserting anything for anchor elements
  } else {

    let attributeProps = [];

    Object.keys(element.attributes).forEach(attrName => {

      // skip adding the style attribute (still add the class) 

      if (attrName == 'style') {
        return;
      }

      let attrValue = element.attributes[attrName];

      attributeProps.push(
        t.objectProperty(
          t.identifier(attrName),
          t.stringLiteral(attrValue)
        )
      );
    });

    if (attributeProps.length > 0) {

      exp.properties.push(
        t.objectProperty(
          t.identifier('attributes'),
          t.objectExpression(attributeProps)
        )
      );
    }

    if (element.style_v2.static.length > 0) {
      const styleObjectExpression = t.objectExpression(
        element.style_v2.static.map(styleEntry => {
          return t.objectProperty(
            t.stringLiteral(styleEntry[0]),
            t.stringLiteral(styleEntry[1])
          );
        })
      );

      const styleProperty = t.objectProperty(
        t.identifier('style'),
        styleObjectExpression
      );

      exp.properties.push(styleProperty);
    }

    if (element.class_v2.static.length > 0) {
      const classObjectExpression = t.arrayExpression(
        element.class_v2.static.map(className => {
          return t.stringLiteral(className);
        })
      );

      const classProperty = t.objectProperty(
        t.identifier('class'),
        classObjectExpression
      );

      exp.properties.push(classProperty);
    }

    if (element.children.length > 0) {
      const childrenProperty = t.objectProperty(
        t.identifier('children'),
        t.arrayExpression(
          element.children.map(childElement => {
            return _createElementExpression(childElement);
          })
        )
      );

      exp.properties.push(childrenProperty);
    }
  }

  return exp;
}

export function createDeclareClientFunctionExpression(clientFunction) {
  return t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier('_c$' + clientFunction.id.toString()),
      t.callExpression(
        t.identifier('_$declareClientFunction'),
        [
          t.objectExpression([
            t.objectProperty(
              t.identifier('argNames'),
              t.arrayExpression(
                clientFunction.argNames.map(argName =>
                  t.stringLiteral(argName)
                )
              )
            ),
            t.objectProperty(
              t.identifier('body'),
              t.stringLiteral(clientFunction.body)
            )
          ])
        ]
      )
    )
  ]);
}