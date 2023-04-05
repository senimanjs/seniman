import { _createBlock, _createComponent, useWindow, useClient, useStream, createHandler } from './v2/window.js';
import { useState, useMemo, onCleanup, onDispose, useEffect, untrack, createContext, useContext, useCallback, runInNode, getActiveNode, onError, wrapPromise } from './v2/state.js';
import { _declareBlock, _declareClientFunction } from './declare.js';
import { MAX_INPUT_EVENT_BUFFER_SIZE } from './config.js';

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

export {
  useState,
  useMemo,
  useEffect,
  useWindow,
  useClient,
  useStream,
  createHandler,

  createContext,
  useContext,
  useCallback,
  runInNode,
  getActiveNode,
  wrapPromise,

  withValue,

  onError,
  onCleanup,
  onDispose,
  untrack,

  _declareBlock,
  _declareClientFunction,
  _createBlock,
  _createComponent,

  MAX_INPUT_EVENT_BUFFER_SIZE
};