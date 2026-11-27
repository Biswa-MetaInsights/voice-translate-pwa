import handler from '../../conversation-summary.js';
import { withMobileAccess } from '../../../lib/mobile/access.js';
export default withMobileAccess(handler);
