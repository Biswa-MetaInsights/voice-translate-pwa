import handler from '../../transcription-token.js';
import { withMobileAccess } from '../../../lib/mobile/access.js';
export default withMobileAccess(handler);
