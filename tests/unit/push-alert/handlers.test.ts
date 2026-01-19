import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import {
  registerDevice,
  listDevices,
  deactivateDevice,
  sendPush,
  listAlerts,
  getAlert,
} from '../../../src/modules/push-alert/handlers';
import {
  registerDeviceSchema,
  sendPushSchema,
  listAlertsSchema,
} from '../../../src/modules/push-alert/validators';
import {
  upsertDevice,
  findDevicesByUserId,
  deactivateDevice as deactivateDeviceService,
  createAlert,
  updateAlertStatus,
  findAlerts as findAlertsService,
  findAlertById,
  findActiveDevicesByUserIds,
  getAllActiveUserIds,
  deactivateDeviceByToken,
} from '../../../src/modules/push-alert/services';
import { findAppByCode } from '../../../src/modules/auth/services';
import * as fcm from '../../../src/modules/push-alert/fcm';
import * as pushProbe from '../../../src/modules/push-alert/push.probe';
import { NotFoundException, BusinessException } from '../../../src/utils/errors';

// Mock all dependencies
vi.mock('../../../src/modules/push-alert/validators', () => ({
  registerDeviceSchema: {
    parse: vi.fn(),
  },
  sendPushSchema: {
    parse: vi.fn(),
  },
  listAlertsSchema: {
    parse: vi.fn(),
  },
}));

vi.mock('../../../src/modules/push-alert/services', () => ({
  upsertDevice: vi.fn(),
  findDevicesByUserId: vi.fn(),
  deactivateDevice: vi.fn(),
  createAlert: vi.fn(),
  updateAlertStatus: vi.fn(),
  findAlerts: vi.fn(),
  findAlertById: vi.fn(),
  findActiveDevicesByUserIds: vi.fn(),
  getAllActiveUserIds: vi.fn(),
  deactivateDeviceByToken: vi.fn(),
}));

vi.mock('../../../src/modules/auth/services', () => ({
  findAppByCode: vi.fn(),
}));

vi.mock('../../../src/modules/push-alert/fcm', () => ({
  getFCMInstance: vi.fn(),
  sendToDevice: vi.fn(),
  sendToMultipleDevices: vi.fn(),
}));

vi.mock('../../../src/modules/push-alert/push.probe', () => ({
  deviceRegistered: vi.fn(),
  deviceDeactivated: vi.fn(),
  pushSent: vi.fn(),
  pushFailed: vi.fn(),
  invalidTokenDetected: vi.fn(),
}));

describe('registerDevice handler', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      body: {
        token: 'FCM_TOKEN',
        platform: 'ios',
      },
      user: { userId: 1, appId: 1 },
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    vi.clearAllMocks();
  });

  it('should register device token successfully', async () => {
    const mockDevice = {
      id: 1,
      userId: 1,
      appId: 1,
      token: 'FCM_TOKEN',
      platform: 'ios',
      isActive: true,
      lastUsedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(registerDeviceSchema.parse).mockReturnValue({
      token: 'FCM_TOKEN',
      platform: 'ios',
    });
    vi.mocked(upsertDevice).mockResolvedValue(mockDevice);

    await registerDevice(req as Request, res as Response);

    expect(registerDeviceSchema.parse).toHaveBeenCalledWith(req.body);
    expect(upsertDevice).toHaveBeenCalledWith({
      userId: 1,
      appId: 1,
      token: 'FCM_TOKEN',
      platform: 'ios',
      deviceId: undefined,
    });
    expect(pushProbe.deviceRegistered).toHaveBeenCalledWith({
      userId: 1,
      appId: 1,
      platform: 'ios',
      deviceId: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      id: 1,
      token: 'FCM_TOKEN',
      platform: 'ios',
      isActive: true,
      lastUsedAt: mockDevice.lastUsedAt,
      createdAt: mockDevice.createdAt,
    });
  });
});

describe('listDevices handler', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      user: { userId: 1, appId: 1 },
    };
    res = {
      json: vi.fn(),
    };
    vi.clearAllMocks();
  });

  it('should list user devices', async () => {
    const mockDevices = [
      {
        id: 1,
        token: 'TOKEN1',
        platform: 'ios',
        isActive: true,
        lastUsedAt: new Date(),
        createdAt: new Date(),
      },
    ];

    vi.mocked(findDevicesByUserId).mockResolvedValue(mockDevices as any);

    await listDevices(req as Request, res as Response);

    expect(findDevicesByUserId).toHaveBeenCalledWith(1, 1);
    expect(res.json).toHaveBeenCalledWith({
      devices: mockDevices,
    });
  });
});

describe('sendPush handler', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      body: {
        appCode: 'wowa',
        userId: 1,
        title: 'Test',
        body: 'Test message',
      },
    };
    res = {
      json: vi.fn(),
    };
    vi.clearAllMocks();
  });

  it('should send push to single user successfully', async () => {
    const mockApp = {
      id: 1,
      code: 'wowa',
      fcmProjectId: 'project-id',
      fcmPrivateKey: '{"private_key": "key"}',
      fcmClientEmail: 'test@test.com',
    };

    const mockDevices = [
      { id: 1, token: 'TOKEN1', userId: 1 },
      { id: 2, token: 'TOKEN2', userId: 1 },
    ];

    const mockAlert = {
      id: 1,
      appId: 1,
      userId: 1,
      title: 'Test',
      body: 'Test message',
      targetType: 'single',
      status: 'pending',
    };

    const mockFcmInstance = {};

    vi.mocked(sendPushSchema.parse).mockReturnValue({
      appCode: 'wowa',
      userId: 1,
      title: 'Test',
      body: 'Test message',
    });
    vi.mocked(findAppByCode).mockResolvedValue(mockApp as any);
    vi.mocked(createAlert).mockResolvedValue(mockAlert as any);
    vi.mocked(findActiveDevicesByUserIds).mockResolvedValue(mockDevices as any);
    vi.mocked(fcm.getFCMInstance).mockReturnValue(mockFcmInstance as any);
    vi.mocked(fcm.sendToMultipleDevices).mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      results: [
        { success: true, messageId: 'msg1' },
        { success: true, messageId: 'msg2' },
      ],
      invalidTokens: [],
    });
    vi.mocked(updateAlertStatus).mockResolvedValue({} as any);

    await sendPush(req as Request, res as Response);

    expect(findAppByCode).toHaveBeenCalledWith('wowa');
    expect(createAlert).toHaveBeenCalled();
    expect(findActiveDevicesByUserIds).toHaveBeenCalledWith([1], 1);
    expect(fcm.sendToMultipleDevices).toHaveBeenCalled();
    expect(updateAlertStatus).toHaveBeenCalledWith(1, {
      status: 'completed',
      sentCount: 2,
      failedCount: 0,
      errorMessage: undefined,
    });
    expect(pushProbe.pushSent).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      alertId: 1,
      sentCount: 2,
      failedCount: 0,
      status: 'completed',
    });
  });

  it('should send push to multiple users', async () => {
    req.body = {
      appCode: 'wowa',
      userIds: [1, 2, 3],
      title: 'Test',
      body: 'Test message',
    };

    const mockApp = {
      id: 1,
      code: 'wowa',
      fcmProjectId: 'project-id',
      fcmPrivateKey: '{"private_key": "key"}',
      fcmClientEmail: 'test@test.com',
    };

    const mockDevices = [
      { id: 1, token: 'TOKEN1', userId: 1 },
      { id: 2, token: 'TOKEN2', userId: 2 },
    ];

    const mockAlert = {
      id: 2,
      appId: 1,
      targetType: 'multiple',
      targetUserIds: [1, 2, 3],
    };

    vi.mocked(sendPushSchema.parse).mockReturnValue(req.body as any);
    vi.mocked(findAppByCode).mockResolvedValue(mockApp as any);
    vi.mocked(createAlert).mockResolvedValue(mockAlert as any);
    vi.mocked(findActiveDevicesByUserIds).mockResolvedValue(mockDevices as any);
    vi.mocked(fcm.getFCMInstance).mockReturnValue({} as any);
    vi.mocked(fcm.sendToMultipleDevices).mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      results: [],
      invalidTokens: [],
    });

    await sendPush(req as Request, res as Response);

    expect(findActiveDevicesByUserIds).toHaveBeenCalledWith([1, 2, 3], 1);
  });

  it('should send push to all users', async () => {
    req.body = {
      appCode: 'wowa',
      targetType: 'all',
      title: 'Test',
      body: 'Test message',
    };

    const mockApp = {
      id: 1,
      code: 'wowa',
      fcmProjectId: 'project-id',
      fcmPrivateKey: '{"private_key": "key"}',
      fcmClientEmail: 'test@test.com',
    };

    const mockUserIds = [1, 2, 3];
    const mockDevices = [{ id: 1, token: 'TOKEN1', userId: 1 }];

    vi.mocked(sendPushSchema.parse).mockReturnValue(req.body as any);
    vi.mocked(findAppByCode).mockResolvedValue(mockApp as any);
    vi.mocked(createAlert).mockResolvedValue({ id: 3, targetType: 'all' } as any);
    vi.mocked(getAllActiveUserIds).mockResolvedValue(mockUserIds);
    vi.mocked(findActiveDevicesByUserIds).mockResolvedValue(mockDevices as any);
    vi.mocked(fcm.getFCMInstance).mockReturnValue({} as any);
    vi.mocked(fcm.sendToMultipleDevices).mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      results: [],
      invalidTokens: [],
    });

    await sendPush(req as Request, res as Response);

    expect(getAllActiveUserIds).toHaveBeenCalledWith(1);
    expect(findActiveDevicesByUserIds).toHaveBeenCalledWith(mockUserIds, 1);
  });

  it('should handle invalid tokens', async () => {
    const mockApp = {
      id: 1,
      code: 'wowa',
      fcmProjectId: 'project-id',
      fcmPrivateKey: '{"private_key": "key"}',
      fcmClientEmail: 'test@test.com',
    };

    vi.mocked(sendPushSchema.parse).mockReturnValue(req.body as any);
    vi.mocked(findAppByCode).mockResolvedValue(mockApp as any);
    vi.mocked(createAlert).mockResolvedValue({ id: 1 } as any);
    vi.mocked(findActiveDevicesByUserIds).mockResolvedValue([{ token: 'INVALID_TOKEN' }] as any);
    vi.mocked(fcm.getFCMInstance).mockReturnValue({} as any);
    vi.mocked(fcm.sendToMultipleDevices).mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      results: [{ success: false, isInvalidToken: true }],
      invalidTokens: ['INVALID_TOKEN'],
    });

    await sendPush(req as Request, res as Response);

    expect(deactivateDeviceByToken).toHaveBeenCalledWith('INVALID_TOKEN', 1);
    expect(pushProbe.invalidTokenDetected).toHaveBeenCalled();
  });

  it('should throw error when app not found', async () => {
    vi.mocked(sendPushSchema.parse).mockReturnValue(req.body as any);
    vi.mocked(findAppByCode).mockResolvedValue(null);

    await expect(sendPush(req as Request, res as Response)).rejects.toThrow(NotFoundException);
  });
});

describe('listAlerts handler', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      query: {
        appCode: 'wowa',
        limit: '10',
        offset: '0',
      },
    };
    res = {
      json: vi.fn(),
    };
    vi.clearAllMocks();
  });

  it('should list alerts', async () => {
    const mockApp = { id: 1, code: 'wowa' };
    const mockAlerts = [
      {
        id: 1,
        title: 'Test',
        targetType: 'single',
        sentCount: 1,
        failedCount: 0,
        status: 'completed',
        sentAt: new Date(),
        createdAt: new Date(),
      },
    ];

    vi.mocked(listAlertsSchema.parse).mockReturnValue({
      appCode: 'wowa',
      limit: 10,
      offset: 0,
    });
    vi.mocked(findAppByCode).mockResolvedValue(mockApp as any);
    vi.mocked(findAlertsService).mockResolvedValue(mockAlerts as any);

    await listAlerts(req as Request, res as Response);

    expect(findAlertsService).toHaveBeenCalledWith(1, 10, 0);
    expect(res.json).toHaveBeenCalledWith({
      alerts: mockAlerts,
      total: 1,
    });
  });
});

describe('getAlert handler', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      params: { id: '1' },
      query: { appCode: 'wowa' },
    };
    res = {
      json: vi.fn(),
    };
    vi.clearAllMocks();
  });

  it('should get alert by id', async () => {
    const mockApp = { id: 1, code: 'wowa' };
    const mockAlert = {
      id: 1,
      title: 'Test',
      body: 'Message',
      data: {},
      imageUrl: null,
      targetType: 'single',
      targetUserIds: [],
      sentCount: 1,
      failedCount: 0,
      status: 'completed',
      errorMessage: null,
      sentAt: new Date(),
      createdAt: new Date(),
    };

    vi.mocked(findAppByCode).mockResolvedValue(mockApp as any);
    vi.mocked(findAlertById).mockResolvedValue(mockAlert as any);

    await getAlert(req as Request, res as Response);

    expect(findAlertById).toHaveBeenCalledWith(1, 1);
    expect(res.json).toHaveBeenCalledWith(mockAlert);
  });

  it('should throw error when alert not found', async () => {
    const mockApp = { id: 1, code: 'wowa' };

    vi.mocked(findAppByCode).mockResolvedValue(mockApp as any);
    vi.mocked(findAlertById).mockResolvedValue(null);

    await expect(getAlert(req as Request, res as Response)).rejects.toThrow(NotFoundException);
  });
});
