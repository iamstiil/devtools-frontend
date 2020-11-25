// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as LinearMemoryInspector from '../../../../front_end/linear_memory_inspector/linear_memory_inspector.js';

import {assertElement, assertElements, assertShadowRoot, getElementWithinComponent, getEventPromise, renderElementIntoDOM} from '../helpers/DOMHelpers.js';

const {assert} = chai;

const NUM_BYTES_PER_GROUP = 4;
export const VIEWER_BYTE_CELL_SELECTOR = '.byte-cell';
export const VIEWER_TEXT_CELL_SELECTOR = '.text-cell';
export const VIEWER_ROW_SELECTOR = '.row';
export const VIEWER_ADDRESS_SELECTOR = '.address';

describe('LinearMemoryViewer', () => {
  async function setUpComponent() {
    const component = new LinearMemoryInspector.LinearMemoryViewer.LinearMemoryViewer();
    const flexWrapper = document.createElement('div');
    flexWrapper.style.width = '500px';
    flexWrapper.style.height = '500px';
    flexWrapper.style.display = 'flex';
    flexWrapper.appendChild(component);
    renderElementIntoDOM(flexWrapper);
    const data = createComponentData();
    component.data = data;

    const event = await getEventPromise<LinearMemoryInspector.LinearMemoryViewer.ResizeEvent>(component, 'resize');
    const numBytesPerPage = event.data;
    assert.isAbove(numBytesPerPage, 4);

    // trigger re-render
    component.data = data;
    return {component, data};
  }

  function createComponentData() {
    const memory = [];
    for (let i = 0; i < 1000; ++i) {
      memory.push(i);
    }

    const data = {
      memory: new Uint8Array(memory),
      address: 2,
      memoryOffset: 0,
    };

    return data;
  }

  function getCellsPerRow(
      component: LinearMemoryInspector.LinearMemoryViewer.LinearMemoryViewer, cellSelector: string) {
    assertShadowRoot(component.shadowRoot);
    const row = component.shadowRoot.querySelector(VIEWER_ROW_SELECTOR);
    assertElement(row, HTMLDivElement);
    const cellsPerRow = row.querySelectorAll(cellSelector);
    assert.isNotEmpty(cellsPerRow);
    assertElements(cellsPerRow, HTMLSpanElement);
    return cellsPerRow;
  }

  it('correctly renders bytes given a memory offset greater than zero', async () => {
    const data = createComponentData();
    data.memoryOffset = 1;
    assert.isAbove(data.address, data.memoryOffset);
    const component = new LinearMemoryInspector.LinearMemoryViewer.LinearMemoryViewer();
    component.data = data;
    renderElementIntoDOM(component);

    const selectedByte = getElementWithinComponent(component, VIEWER_BYTE_CELL_SELECTOR + '.selected', HTMLSpanElement);
    const selectedValue = parseInt(selectedByte.innerText, 16);
    assert.strictEqual(selectedValue, data.memory[data.address - data.memoryOffset]);
  });

  it('triggers an event on resize', async () => {
    const data = createComponentData();
    const component = new LinearMemoryInspector.LinearMemoryViewer.LinearMemoryViewer();
    component.data = data;

    const thinWrapper = document.createElement('div');
    thinWrapper.style.width = '100px';
    thinWrapper.style.height = '100px';
    thinWrapper.style.display = 'flex';
    thinWrapper.appendChild(component);
    renderElementIntoDOM(thinWrapper);


    const eventPromise = getEventPromise<LinearMemoryInspector.LinearMemoryViewer.ResizeEvent>(component, 'resize');
    thinWrapper.style.width = '800px';

    assert.isNotNull(await eventPromise);
  });

  describe('address view', () => {
    it('renders one address per row', async () => {
      const {component} = await setUpComponent();
      assertShadowRoot(component.shadowRoot);
      const rows = component.shadowRoot.querySelectorAll(VIEWER_ROW_SELECTOR);
      const addresses = component.shadowRoot.querySelectorAll(VIEWER_ADDRESS_SELECTOR);
      assert.isNotEmpty(rows);
      assert.strictEqual(rows.length, addresses.length);
    });

    it('renders addresses depending on the bytes per row', async () => {
      const {component, data} = await setUpComponent();
      const bytesPerRow = getCellsPerRow(component, VIEWER_BYTE_CELL_SELECTOR);
      const numBytesPerRow = bytesPerRow.length;

      assertShadowRoot(component.shadowRoot);
      const addresses = component.shadowRoot.querySelectorAll(VIEWER_ADDRESS_SELECTOR);
      assert.isNotEmpty(addresses);

      for (let i = 0, currentAddress = data.memoryOffset; i < addresses.length; currentAddress += numBytesPerRow, ++i) {
        const addressElement = addresses[i];
        assertElement(addressElement, HTMLSpanElement);

        const hex = currentAddress.toString(16).toUpperCase().padStart(8, '0');
        assert.strictEqual(addressElement.innerText, hex);
      }
    });
  });

  describe('bytes view', () => {
    it('renders unsplittable byte group', async () => {
      const thinWrapper = document.createElement('div');
      thinWrapper.style.width = '10px';

      const component = new LinearMemoryInspector.LinearMemoryViewer.LinearMemoryViewer();
      component.data = createComponentData();
      thinWrapper.appendChild(component);
      renderElementIntoDOM(thinWrapper);
      const bytesPerRow = getCellsPerRow(component, VIEWER_BYTE_CELL_SELECTOR);
      assert.strictEqual(bytesPerRow.length, NUM_BYTES_PER_GROUP);
    });

    it('renders byte values corresponding to memory set', async () => {
      const {component, data} = await setUpComponent();
      assertShadowRoot(component.shadowRoot);
      const bytes = component.shadowRoot.querySelectorAll(VIEWER_BYTE_CELL_SELECTOR);
      assertElements(bytes, HTMLSpanElement);

      const memory = data.memory;
      const bytesPerPage = bytes.length;
      const memoryStartAddress = Math.floor(data.address / bytesPerPage) * bytesPerPage;
      assert.isAtMost(bytes.length, memory.length);
      for (let i = 0; i < bytes.length; ++i) {
        const hex = memory[memoryStartAddress + i].toString(16).toUpperCase().padStart(2, '0');
        assert.strictEqual(bytes[i].innerText, hex);
      }
    });

    it('triggers an event on selecting a byte value', async () => {
      const {component, data} = await setUpComponent();
      assertShadowRoot(component.shadowRoot);

      const byte = component.shadowRoot.querySelector(VIEWER_BYTE_CELL_SELECTOR);
      assertElement(byte, HTMLSpanElement);

      const eventPromise =
          getEventPromise<LinearMemoryInspector.LinearMemoryViewer.ByteSelectedEvent>(component, 'byte-selected');
      byte.click();
      const {data: address} = await eventPromise;
      assert.strictEqual(address, data.memoryOffset);
    });
  });

  describe('ascii view', () => {
    it('renders as many ascii values as byte values in a row', async () => {
      const {component} = await setUpComponent();
      const bytes = getCellsPerRow(component, VIEWER_BYTE_CELL_SELECTOR);
      const ascii = getCellsPerRow(component, VIEWER_TEXT_CELL_SELECTOR);

      assert.strictEqual(bytes.length, ascii.length);
    });

    it('renders ascii values corresponding to bytes', async () => {
      const {component} = await setUpComponent();
      assertShadowRoot(component.shadowRoot);

      const asciiValues = component.shadowRoot.querySelectorAll(VIEWER_TEXT_CELL_SELECTOR);
      const byteValues = component.shadowRoot.querySelectorAll(VIEWER_BYTE_CELL_SELECTOR);
      assertElements(asciiValues, HTMLSpanElement);
      assertElements(byteValues, HTMLSpanElement);
      assert.strictEqual(byteValues.length, asciiValues.length);

      const smallestPrintableAscii = 20;
      const largestPrintableAscii = 127;

      for (let i = 0; i < byteValues.length; ++i) {
        const byteValue = parseInt(byteValues[i].innerText, 16);
        const asciiText = asciiValues[i].innerText;
        if (byteValue < smallestPrintableAscii || byteValue > largestPrintableAscii) {
          assert.strictEqual(asciiText, '.');
        } else {
          assert.strictEqual(asciiText, String.fromCharCode(byteValue).trim());
        }
      }
    });

    it('triggers an event on selecting an ascii value', async () => {
      const {component, data} = await setUpComponent();
      assertShadowRoot(component.shadowRoot);

      const asciiCell = component.shadowRoot.querySelector(VIEWER_TEXT_CELL_SELECTOR);
      assertElement(asciiCell, HTMLSpanElement);

      const eventPromise =
          getEventPromise<LinearMemoryInspector.LinearMemoryViewer.ByteSelectedEvent>(component, 'byte-selected');
      asciiCell.click();
      const {data: address} = await eventPromise;
      assert.strictEqual(address, data.memoryOffset);
    });
  });

  describe('setting the address', () => {
    function assertSelectedCellIsHighlighted(
        component: LinearMemoryInspector.LinearMemoryViewer.LinearMemoryViewer, cellSelector: string, index: number) {
      assertShadowRoot(component.shadowRoot);
      const selectedCells = component.shadowRoot.querySelectorAll(cellSelector + '.selected');
      assert.lengthOf(selectedCells, 1);
      assertElements(selectedCells, HTMLSpanElement);
      const selectedCell = selectedCells[0];

      const allCells = getCellsPerRow(component, cellSelector);
      assert.isAtLeast(allCells.length, index);
      const cellAtAddress = allCells[index];

      assert.strictEqual(selectedCell, cellAtAddress);
    }

    it('highlights selected byte value', async () => {
      const component = new LinearMemoryInspector.LinearMemoryViewer.LinearMemoryViewer();
      const memory = new Uint8Array([2, 3, 5, 3]);
      const address = 2;

      renderElementIntoDOM(component);
      component.data = {
        memory,
        address,
        memoryOffset: 0,
      };

      assertSelectedCellIsHighlighted(component, VIEWER_BYTE_CELL_SELECTOR, address);
      assertSelectedCellIsHighlighted(component, VIEWER_TEXT_CELL_SELECTOR, address);
      assertSelectedCellIsHighlighted(component, VIEWER_ADDRESS_SELECTOR, 0);
    });
  });
});
