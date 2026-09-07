import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.fieldnote.collect',
  appName: 'FieldNote',
  webDir: 'dist',
  backgroundColor: '#183d37',
  android: {
    backgroundColor: '#183d37',
    useLegacyBridge: true,
  },
  ios: {
    backgroundColor: '#183d37',
    contentInset: 'always',
  },
}

export default config
