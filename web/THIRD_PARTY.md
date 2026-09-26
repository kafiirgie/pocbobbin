# Third-party libraries (web viewer)

Direct dependencies of `web/`, with the version installed and the license declared in each
package's own `package.json`. UI components under `src/components/ui/` are shadcn/ui source copied
in by the shadcn CLI (MIT) and edited in this repository.

## Shipped in the page

| Package | Version | License | Used for |
|---|---|---|---|
| `react`, `react-dom` | 18.3.1 | MIT | UI runtime |
| `radix-ui` | 1.6.7 | MIT | Accessible primitives under the shadcn/ui components |
| `class-variance-authority` | 0.7.1 | Apache-2.0 | Component variants (shadcn/ui) |
| `cn` | 0.4.0 | MIT | Tailwind class merging (shadcn/ui, from `shadcn-ui/cn`) |
| `tw-animate-css` | 1.4.0 | MIT | Enter/exit animations (shadcn/ui) |
| `shadcn` | 4.21.0 | MIT | `shadcn/tailwind.css` base styles, and the CLI that installed the components |
| `lucide-react` | 1.48.0 | ISC | Icons |
| `@xyflow/react` | 12.12.0 | MIT | Evidence map and repo map (React Flow) |
| `elkjs` | 0.12.0 | EPL-2.0 OR GPL-3.0-or-later | Nested folder → file layout for both maps; lazy-loaded with the map |

**Note on `elkjs`:** it is the only dependency that is not MIT/ISC/Apache. It is used unmodified
from npm, under EPL-2.0. Confirm this is acceptable for the submission's license requirements.

## Build tooling only (not shipped)

| Package | Version | License |
|---|---|---|
| `vite` | 6.4.3 | MIT |
| `@vitejs/plugin-react` | 4.7.0 | MIT |
| `tailwindcss`, `@tailwindcss/vite` | 4.3.3 | MIT |
| `typescript` | 5.9.3 | Apache-2.0 |
| `@types/react` | 18.3.31 | MIT |
| `@types/react-dom` | 18.3.7 | MIT |
| `@types/node` | 22.20.4 | MIT |
