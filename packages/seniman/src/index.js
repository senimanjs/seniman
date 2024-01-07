import { _createBlock, _createComponent, useWindow, useClient, createHandler, createChannel, createRef, Sequence } from './window.js';
import { createModule } from './module.js';
import { createCollection } from './collection.js';
import { useState, useMemo, onCleanup, onDispose, useEffect, useDisposableEffect, untrack, createContext, useContext, useCallback, getActiveNode, runInScope, getActiveScope } from './state.js';
import { _declareBlock, _declareClientFunction } from './declare.js';
import { MAX_INPUT_EVENT_BUFFER_SIZE } from './config.js';
import { createRoot } from './window_manager.js';

function withValue(fn) {
  let handler;

  if (typeof fn === 'function') {
    handler = createHandler(fn);
  } else {
    // if not function, assume it is already a handler
    handler = fn;
  }

  return $c((e) => $s(handler)(e.target.value));
}

function preventDefault(fn) {
  let handler;

  if (typeof fn === 'function') {
    handler = createHandler(fn);
  } else {
    // if not function, assume it is already a handler
    handler = fn;
  }

  return $c((e) => {
    e.preventDefault();
    $s(handler)();
  });
}

function Anchor(props) {
  let client = useClient();

  return <a
    href={props.href}
    style={props.style}
    class={props.class}
    onClick={preventDefault(() => {
      if (props.onClick) {
        let returnValue = props.onClick(props.href);
        if (returnValue === false) {
          return;
        }
      }

      client.location.setHref(props.href);
    })}>{props.children}</a>;
}

export {
  useState,
  useMemo,
  useEffect,
  useDisposableEffect,
  useWindow,
  useClient,
  createHandler,
  createCollection,
  createChannel,
  createRef,
  createModule,
  Sequence,

  createRoot,

  createContext,
  useContext,
  useCallback,
  getActiveNode,

  withValue,
  preventDefault,
  Anchor,

  onCleanup,
  onDispose,
  untrack,

  runInScope,
  getActiveScope,

  _declareBlock,
  _declareClientFunction,
  _createBlock,
  _createComponent,

  MAX_INPUT_EVENT_BUFFER_SIZE
};