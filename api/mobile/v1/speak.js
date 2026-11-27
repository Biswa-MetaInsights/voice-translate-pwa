import handler from '../../speak.js';
import { withMobileAccess } from '../../../lib/mobile/access.js';
export default withMobileAccess(handler);
