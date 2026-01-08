// Central place to wire up icons so components can stay clean.
// If you want to add more icons later, import them here.

import { library } from '@fortawesome/fontawesome-svg-core'
import { faCalendarDay } from '@fortawesome/free-solid-svg-icons'

// Add icons to the FontAwesome library (optional but useful if you later want to use string-based icons)
library.add(faCalendarDay)

export { faCalendarDay }

