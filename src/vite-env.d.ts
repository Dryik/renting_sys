/// <reference types="vite/client" />

import type { RentalAppApi } from "../electron/types";

declare global {
  interface Window {
    rentalApp: RentalAppApi;
  }
}

export {};
