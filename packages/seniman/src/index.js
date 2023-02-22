import { _createBlock, _createComponent, useWindow } from './v2/window.js';
import { useState, useMemo, onCleanup, useEffect, untrack, createContext, useContext, useCallback, runInNode, getActiveNode, onError } from './v2/state.js';
import { _declareBlock, _declareClientFunction } from './declare.js';

function withValue(fn) {
  return $c((e) => $s(fn)(e.target.value));
}

export {
  useState,
  useMemo,
  useEffect,
  useWindow,

  createContext,
  useContext,
  useCallback,
  runInNode,
  getActiveNode,

  withValue,

  onError,
  onCleanup,
  untrack,

  _declareBlock,
  _declareClientFunction,
  _createBlock,
  _createComponent,
};