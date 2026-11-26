import { withMobileAccess } from '../../../lib/mobile/access.js';
import { createReportHandler } from '../../../lib/mobile/report.js';
export default withMobileAccess(createReportHandler());
