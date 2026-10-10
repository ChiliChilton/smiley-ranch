// Geoman's bundle looks for Leaflet on window.L. Import this before the plugin.
import L from 'leaflet'
;(window as unknown as { L: typeof L }).L = L
