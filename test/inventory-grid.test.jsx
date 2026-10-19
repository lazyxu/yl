/** @jest-environment jsdom */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import InventoryGrid from '../src/InventoryGrid'

test('empty -> populated -> empty inventory obeys React hook order', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const palette = () => ({ hex: '#eeeeee' })
  try {
    await act(async () => root.render(<InventoryGrid groupedInventory={[]} findPalette={palette} />))
    expect(host.textContent).toBe('')
    await act(async () => root.render(<InventoryGrid groupedInventory={[[ 'A', [{ color: 'A1', count: 23 }]]] } findPalette={palette} />))
    expect(host.textContent).toContain('A1')
    await act(async () => root.render(<InventoryGrid groupedInventory={[]} findPalette={palette} />))
    expect(host.textContent).toBe('')
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
