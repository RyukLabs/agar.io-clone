// import { solana, solanaDevnet, solanaTestnet } from '@reown/appkit/networks'
// import { createAppKit } from '@reown/appkit'
// import { SolanaAdapter } from '@reown/appkit-adapter-solana'

const { solana, solanaDevnet, solanaTestnet } = require('@reown/appkit/networks');
const { createAppKit } = require('@reown/appkit');
const { SolanaAdapter } = require('@reown/appkit-adapter-solana');


const projectId = "b56e18d47c72ab683b10814fe9495694" // this is a public projectId only to use on localhost
if (!projectId) {
  throw new Error('VITE_PROJECT_ID is not set')
}
console.log("projectId:", projectId);
export const appKit = createAppKit({
  adapters: [new SolanaAdapter()],
  networks: [solana, solanaDevnet, solanaTestnet],
  projectId,
  themeMode: 'light',
  themeVariables: {
    '--w3m-accent': '#000000',
  },
  features: {
    analytics: true,
  }
})
