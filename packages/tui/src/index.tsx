import { render } from 'ink'
import { createSupervisor } from '@terrarium/core'
import { App } from './App'

render(<App supervisor={createSupervisor()} />)
