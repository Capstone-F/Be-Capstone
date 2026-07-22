import { Logger } from '@nestjs/common';

// Expected failure-path tests log via Nest Logger; keep unit output readable.
Logger.overrideLogger(false);
