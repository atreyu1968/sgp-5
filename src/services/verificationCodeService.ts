import { v4 as uuidv4 } from 'uuid';
import { VerificationCode, VerificationCodeStatus, VerificationCodeLog } from '../types/verificationCode';
import { UserRole } from '../types/user';

const CODES_STORAGE_KEY = 'verification_codes';
const LOGS_STORAGE_KEY = 'verification_code_logs';

function getStoredData(key: string) {
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : {};
}

function saveStoredData(key: string, data: any) {
  localStorage.setItem(key, JSON.stringify(data));
}

function generateSecureCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  const randomValues = new Uint32Array(8);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 8; i++) {
    code += chars[randomValues[i] % chars.length];
  }
  return code;
}

function addLog(codeId: string, action: VerificationCodeLog['action'], details?: string) {
  const logs = getStoredData(LOGS_STORAGE_KEY);
  const log: VerificationCodeLog = {
    id: uuidv4(),
    codeId,
    action,
    timestamp: new Date().toISOString(),
    details
  };
  logs[log.id] = log;
  saveStoredData(LOGS_STORAGE_KEY, logs);
}

export class VerificationCodeService {
  private static instance: VerificationCodeService;
  private codes: Record<string, VerificationCode> = {};

  private constructor() {
    const stored = localStorage.getItem(CODES_STORAGE_KEY);
    if (stored) {
      this.codes = JSON.parse(stored);
    }
  }

  static getInstance(): VerificationCodeService {
    if (!VerificationCodeService.instance) {
      VerificationCodeService.instance = new VerificationCodeService();
    }
    return VerificationCodeService.instance;
  }

  async generateCode(
    type: UserRole,
    expirationHours: number,
    maxUses: number
  ): Promise<VerificationCode> {
    const code: VerificationCode = {
      id: uuidv4(),
      code: generateSecureCode(),
      type,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expirationHours * 3600000).toISOString(),
      maxUses,
      currentUses: 0,
      status: 'active'
    };

    this.codes[code.id] = code;
    this.persistCodes();
    addLog(code.id, 'generated');
    return code;
  }

  async validateCode(code: string): Promise<VerificationCode | null> {
    const cleanCode = code.trim().toUpperCase();
    const foundCode = Object.values(this.codes).find((c: VerificationCode) => 
      c.code === cleanCode && c.status === 'active'
    );

    if (!foundCode) return null;

    if (new Date(foundCode.expiresAt) < new Date()) {
      await this.revokeCode(foundCode.id, 'expired');
      return null;
    }

    if (foundCode.currentUses >= foundCode.maxUses) {
      await this.revokeCode(foundCode.id, 'used');
      return null;
    }

    return foundCode;
  }

  async useCode(code: string): Promise<VerificationCode | null> {
    const cleanCode = code.trim().toUpperCase();
    const foundCode = await this.validateCode(code);
    if (!foundCode) return null;

    this.codes[foundCode.id].currentUses += 1;
    this.persistCodes();
    addLog(foundCode.id, 'used');
    
    // If max uses reached, update status
    if (this.codes[foundCode.id].currentUses >= this.codes[foundCode.id].maxUses) {
      this.codes[foundCode.id].status = 'used';
      this.persistCodes();
      addLog(foundCode.id, 'used', 'Max uses reached');
    }

    return foundCode;
  }

  private persistCodes() {
    localStorage.setItem(CODES_STORAGE_KEY, JSON.stringify(this.codes));
  }

  async revokeCode(
    id: string,
    reason: 'expired' | 'used' | 'revoked' = 'revoked'
  ): Promise<void> {
    if (this.codes[id]) {
      this.codes[id].status = reason;
      this.persistCodes();
      addLog(id, reason);
    }
  }

  async cleanupCodes(): Promise<void> {
    const now = new Date();

    Object.entries(this.codes).forEach(([id, code]) => {
      if (
        code.status === 'active' && 
        (new Date(code.expiresAt) < now || code.currentUses >= code.maxUses)
      ) {
        this.codes[id].status = new Date(code.expiresAt) < now ? 'expired' : 'used';
        addLog(id, 'cleaned', `Auto cleanup: ${this.codes[id].status}`);
      }
    });

    this.persistCodes();
  }

  async listCodes(filters?: {
    type?: UserRole;
    status?: VerificationCodeStatus;
    fromDate?: string;
    toDate?: string;
  }): Promise<VerificationCode[]> {
    const codes = Object.values(this.codes);
    
    return codes.filter((code: any) => {
      if (filters?.type && code.type !== filters.type) return false;
      if (filters?.status && code.status !== filters.status) return false;
      if (filters?.fromDate && new Date(code.createdAt) < new Date(filters.fromDate)) return false;
      if (filters?.toDate && new Date(code.createdAt) > new Date(filters.toDate)) return false;
      return true;
    });
  }

  async getLogs(codeId?: string): Promise<VerificationCodeLog[]> {
    const logs = Object.values(getStoredData(LOGS_STORAGE_KEY));
    return codeId ? logs.filter((log: any) => log.codeId === codeId) : logs;
  }
}

const verificationCodeService = VerificationCodeService.getInstance();

export {
  verificationCodeService,
  generateSecureCode,
  addLog,
  getStoredData,
  saveStoredData
};

// Export individual methods for direct use
export const {
  generateCode,
  validateCode,
  useCode,
  revokeCode,
  cleanupCodes,
  listCodes,
  getLogs
} = verificationCodeService;