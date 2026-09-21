import fs from 'fs';
import sharp from 'sharp';
import wolfjs from 'wolf.js';
import { io } from 'socket.io-client';

import {
    loadSession,
    closeSessionBrowser
} from './session-loader.js';

import {
    Command
} from './node_modules/wolf.js/src/constants/index.js';

const { WOLF, OnlineState } = wolfjs;

const GROUP_ID = 18432094;

const EVENT_NAME = " ᷂فعاليآت ᷂خليجنا،ذوق.";

const TOTAL_EVENTS = 32;

const EVENT_DURATION_MIN = 45;

const IMAGE_PATH = './178332617173751.jpeg';

// ============================================================
// بداية الجدول
// 21 سبتمبر 2026 - الساعة 12:00 صباحًا بتوقيت السعودية
// ============================================================

const START_TIME =
    new Date('2026-09-25T00:00:00+03:00');

// ============================================================
// متغيرات الاتصال
// ============================================================

let service = null;
let socket = null;
let browserClosed = false;

// ============================================================
// أدوات مساعدة
// ============================================================

const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

function formatAMPM(date) {
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    return `${hours}:${minutes}${ampm}`;
}

function formatDate(date) {
    return date.toLocaleString('ar-SA', {
        timeZone: 'Asia/Riyadh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

// ============================================================
// إغلاق آمن
// ============================================================

async function shutdown(code = 0) {
    console.log('');
    console.log('========================================');
    console.log('🛑 جاري إنهاء التشغيل...');
    console.log('========================================');

    try {
        if (socket) socket.disconnect();
    } catch {}

    try {
        if (service?.websocket?.socket) {
            service.websocket.socket.disconnect();
        }
    } catch {}

    try {
        if (!browserClosed) {
            browserClosed = true;
            await closeSessionBrowser();
        }
    } catch (err) {
        console.log('⚠️ تعذر إغلاق الجلسة:', err?.message || err);
    }

    console.log(`🏁 انتهى البرنامج — Code ${code}`);
    process.exit(code);
}

// ============================================================
// تجهيز الصورة
// ============================================================

async function prepareThumbnail() {
    if (!fs.existsSync(IMAGE_PATH)) {
        throw new Error(`الصورة غير موجودة: ${IMAGE_PATH}`);
    }

    console.log('');
    console.log(`🖼️ تجهيز الصورة: ${IMAGE_PATH}`);

    const buffer = await sharp(IMAGE_PATH)
        .jpeg({ quality: 90 })
        .toBuffer();

    console.log(`✅ تم تجهيز الصورة (${buffer.length} bytes)`);
    return buffer;
}

// ============================================================
// انتظار Authorization
// ============================================================

async function waitForSubscriber(timeoutMs = 60000) {
    const started = Date.now();
    console.log('⏳ انتظار Authorization...');

    while (Date.now() - started < timeoutMs) {
        if (service?.currentSubscriber?.id) {
            console.log('');
            console.log('========================================');
            console.log('✅ Authorization complete');
            console.log('========================================');
            console.log(`👤 الحساب: ${
                service.currentSubscriber.username ||
                service.currentSubscriber.nickname ||
                'غير معروف'
            }`);
            console.log(`🆔 ID: ${service.currentSubscriber.id}`);
            return true;
        }
        await sleep(500);
    }
    return false;
}

// ============================================================
// تهيئة WOLF Handlers
// ============================================================

async function initializeHandlers() {
    console.log('⚙️ تهيئة WOLF handlers...');
    await service.websocket.init();
    const count = Object.keys(service.websocket.handlers || {}).length;
    console.log(`⚙️ تم تحميل ${count} handlers`);
}

// ============================================================
// الاتصال باستخدام رموز GitHub
// ============================================================

async function connectUsingGitHubTokens(credentials) {
    const token = credentials?.token;
    const appCheckToken = credentials?.appCheckToken || '';
    const deviceToken = credentials?.deviceToken || '';

    const isAppCheckEnabled = Boolean(
        credentials?.isAppCheckEnabled ?? appCheckToken
    );

    if (!token) {
        throw new Error('لم يتم العثور على v3APIToken في tokens.json');
    }

    console.log('');
    console.log('========================================');
    console.log('🔐 بيانات الجلسة');
    console.log('========================================');
    console.log(`🔐 WOLF Token length: ${token.length}`);
    console.log(
        appCheckToken
            ? `🛡️ AppCheck length: ${appCheckToken.length}`
            : '⚠️ AppCheck Token غير موجود'
    );
    if (deviceToken) {
        console.log(`📱 DeviceToken length: ${deviceToken.length}`);
    }
    console.log(`🛡️ App Check: ${isAppCheckEnabled ? 'enabled' : 'disabled'}`);
    console.log('========================================');

    // ========================================================
    // إنشاء WOLF
    // ========================================================

    service = new WOLF();
    service.config.framework.login.token = token;
    service.config.framework.login.onlineState = OnlineState.INVISIBLE;

    if (appCheckToken) {
        service.config.framework.login.appCheckToken = appCheckToken;
    }

    // ========================================================
    // تهيئة Handlers
    // ========================================================

    await initializeHandlers();

    // ========================================================
    // إعداد الاتصال
    // ========================================================

    const connection = service._frameworkConfig?.get?.('connection');
    const host = connection?.host || 'https://v3-rc.palringo.com';
    const port = connection?.port ?? 443;

    // ★ نجبر web
    const connectionDevice = 'web';

    console.log('');
    console.log('========================================');
    console.log('🔌 بدء اتصال WOLF');
    console.log('========================================');
    console.log(`🌐 Host: ${host}`);
    console.log(`🔌 Port: ${port}`);
    console.log(`📱 Device: ${connectionDevice}`);

    // ========================================================
    // Socket.IO
    // ========================================================

    socket = io(`${host}:${port}`, {
        transports: ['websocket'],
        reconnection: true,
        autoConnect: false,
        query: {
            token,
            device: connectionDevice,
            state: service.config.framework.login.onlineState,
            version: connection?.version || undefined,
            isAppCheckEnabled: isAppCheckEnabled ? 'true' : 'false',
            appCheckToken: isAppCheckEnabled ? appCheckToken : undefined,
            deviceToken: deviceToken || undefined
        }
    });

    service.websocket.socket = socket;

    // ========================================================
    // Connected
    // ========================================================

    socket.on('connect', () => {
        console.log('');
        console.log('========================================');
        console.log('🔗 تم الاتصال بـ WOLF Socket.IO');
        console.log(`🔗 Connection ID: ${socket.id}`);
        console.log('========================================');
    });

    socket.on('connect_error', error => {
        console.error('❌ Connection error:', error?.message || error);
    });

    socket.on('disconnect', reason => {
        console.log(`🔌 Connection closed: ${reason}`);
    });

    // ========================================================
    // تمرير أحداث WOLF إلى Handlers
    // ========================================================

    socket.onAny(async (eventName, data) => {
        try {
            if (eventName === 'group event update') return;

            const handler = service.websocket.handlers?.[eventName];
            if (!handler) return;

            await handler.process(data?.body ?? data);
        } catch (error) {
            console.error(
                `❌ Handler error [${eventName}]:`,
                error?.message || error
            );
        }
    });

    // ========================================================
    // الاتصال
    // ========================================================

    console.log('🔌 Connecting...');
    socket.connect();

    // ========================================================
    // انتظار Authorization
    // ========================================================

    const ready = await waitForSubscriber(60000);
    if (!ready) {
        throw new Error('WOLF اتصل لكن Authorization لم يكتمل.');
    }

    console.log('');
    console.log('🟢 WOLF جاهز للفعاليات.');
}

// ============================================================
// جلب الفعاليات الموجودة
// ============================================================

async function getExistingEvents() {
    console.log('');
    console.log('🔍 جاري جلب فعاليات الروم...');
    console.log(`🏠 GROUP_ID: ${GROUP_ID}`);

    try {
        console.log('📡 إرسال GROUP_EVENT_LIST...');

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(
                    'انتهت مهلة جلب قائمة الفعاليات بعد 30 ثانية.'
                ));
            }, 30000);
        });

        const requestPromise = service.websocket.emit(
            Command.GROUP_EVENT_LIST,
            {
                id: Number(GROUP_ID),
                subscribe: true,
                offset: 0,
                limit: service._frameworkConfig?.batching?.length || 100
            }
        );

        const response = await Promise.race([
            requestPromise,
            timeoutPromise
        ]);

        console.log('📦 تم استلام رد GROUP_EVENT_LIST');

        if (!response) {
            console.log('⚠️ لم يتم استلام Response.');
            return false;
        }

        console.log('📦 Success:', response.success);

        if (!response.success) {
            console.log('⚠️ فشل طلب قائمة الفعاليات.');
            console.log(JSON.stringify(response, null, 2));
            return false;
        }

        const body = Array.isArray(response.body) ? response.body : [];

        if (body.length === 0) {
            console.log('');
            console.log('ℹ️ لا توجد فعاليات في الروم.');
            console.log('↩️ سيتم إرجاع false.');
            return false;
        }

        console.log(`📋 تم العثور على ${body.length} فعالية.`);

        const ids = body.map(event => event?.id).filter(Boolean);

        if (!ids.length) {
            console.log('⚠️ لم يتم العثور على Event IDs.');
            return false;
        }

        console.log(`🔎 جاري جلب تفاصيل ${ids.length} فعالية...`);

        const details = await service.event.getByIds(ids);

        if (!Array.isArray(details)) {
            console.log('⚠️ تفاصيل الفعاليات ليست Array.');
            return false;
        }

        console.log(`✅ تم جلب ${details.length} فعالية موجودة.`);
        return details;

    } catch (err) {
        console.error('');
        console.error('❌ خطأ أثناء جلب فعاليات الروم:');
        console.error(err?.stack || err?.message || err);
        return false;
    }
}

// ============================================================
// أوقات الفعاليات
// ============================================================

function getEventStart(event) {
    if (!event) return NaN;
    if (event.startsAt instanceof Date) return event.startsAt.getTime();
    return new Date(event.startsAt).getTime();
}

function getEventEnd(event) {
    if (!event) return NaN;
    if (event.endsAt instanceof Date) return event.endsAt.getTime();
    return new Date(event.endsAt).getTime();
}

// ============================================================
// فحص التعارض
// ============================================================

function findConflict(existingEvents, startTime, endTime) {
    return existingEvents.find(event => {
        const eStart = getEventStart(event);
        const eEnd = getEventEnd(event);

        if (!Number.isFinite(eStart) || !Number.isFinite(eEnd)) {
            return false;
        }

        return (
            startTime.getTime() < eEnd &&
            endTime.getTime() > eStart
        );
    });
}

// ============================================================
// إنشاء الفعاليات
// ============================================================

async function createEvents(existingEvents) {
    const createdEventIds = [];
    let startTime = new Date(START_TIME);

    const relevantEvents = existingEvents.filter(event => {
        const end = getEventEnd(event);
        return Number.isFinite(end) && end > START_TIME.getTime();
    });

    console.log('');
    console.log('========================================');
    console.log('🚀 بدء إنشاء الفعاليات');
    console.log('========================================');
    console.log(`📅 البداية: ${formatDate(startTime)}`);
    console.log(`⏱️ مدة كل فعالية: ${EVENT_DURATION_MIN} دقيقة`);
    console.log(`🔢 العدد المطلوب: ${TOTAL_EVENTS}`);
    console.log(`🔍 فعاليات مؤثرة على الجدول: ${relevantEvents.length}`);
    console.log('');

    for (let i = 0; i < TOTAL_EVENTS; i++) {
        const endTime = new Date(
            startTime.getTime() + EVENT_DURATION_MIN * 60 * 1000
        );

        const number = i + 1;

        console.log(
            `\n[${number}/${TOTAL_EVENTS}] ` +
            `${formatDate(startTime)} → ${formatDate(endTime)}`
        );

        const conflict = findConflict(relevantEvents, startTime, endTime);

        if (conflict) {
            console.log('⚠️ يوجد تعارض — تم تجاوز الفترة.');

            if (conflict.id) {
                console.log(`   ↳ Event ID: ${conflict.id}`);
            }

            if (conflict.startsAt && conflict.endsAt) {
                console.log(
                    `   ↳ ${formatDate(new Date(conflict.startsAt))}` +
                    ` → ${formatDate(new Date(conflict.endsAt))}`
                );
            }
        } else {
            try {
                const response = await service.event.group.create(
                    GROUP_ID,
                    {
                        title: EVENT_NAME,
                        startsAt: startTime,
                        endsAt: endTime
                    }
                );

                if (response?.success) {
                    const eventId = response.body?.id;

                    if (eventId) {
                        const numericEventId = parseInt(eventId, 10);
                        createdEventIds.push(numericEventId);

                        console.log(
                            `✅ تم إنشاء الفعالية` +
                            ` | ID: ${eventId}` +
                            ` | الوقت: ${formatAMPM(startTime)}`
                        );

                        relevantEvents.push({
                            id: numericEventId,
                            startsAt: new Date(startTime),
                            endsAt: new Date(endTime),
                            title: EVENT_NAME
                        });
                    } else {
                        console.log('⚠️ تم الإنشاء لكن لم يتم العثور على Event ID.');
                        console.log(JSON.stringify(response, null, 2));
                    }
                } else {
                    console.log('❌ فشل إنشاء الفعالية.');
                    console.log(JSON.stringify(response, null, 2));
                }
            } catch (err) {
                console.error(
                    `❌ خطأ في إنشاء الفعالية رقم ${number}:`,
                    err?.message || err
                );
            }
        }

        startTime = new Date(endTime.getTime());
        await sleep(700);
    }

    console.log('');
    console.log('========================================');
    console.log(`📊 تم إنشاء ${createdEventIds.length} من ${TOTAL_EVENTS}`);
    console.log('========================================');

    return createdEventIds;
}

// ============================================================
// رفع الصور
// ============================================================

async function uploadThumbnails(eventIds, thumbnailBuffer) {
    if (!eventIds.length) {
        console.log('');
        console.log('ℹ️ لا توجد فعاليات جديدة لرفع الصور لها.');
        return;
    }

    console.log('');
    console.log('========================================');
    console.log('🖼️ رفع صور الفعاليات');
    console.log('========================================');

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < eventIds.length; i++) {
        const eventId = eventIds[i];

        console.log('');
        console.log(
            `🖼️ [${i + 1}/${eventIds.length}] ` +
            `رفع صورة ID ${eventId}...`
        );

        try {
            if (!Number.isFinite(Number(eventId)) || Number(eventId) <= 0) {
                throw new Error(`Event ID غير صالح: ${eventId}`);
            }

            if (!Buffer.isBuffer(thumbnailBuffer)) {
                throw new Error('الصورة ليست Buffer صالح.');
            }

            const numericEventId = parseInt(eventId, 10);

            const response = await service.event.group.updateThumbnail(
                numericEventId,
                thumbnailBuffer
            );

            if (response?.success === true) {
                successCount++;
                console.log(`✅ تم رفع الصورة بنجاح للفعالية ${numericEventId}`);
            } else if (response && response.success !== false) {
                successCount++;
                console.log(`✅ اكتمل طلب رفع الصورة للفعالية ${numericEventId}`);
                if (response) {
                    console.log('📦 Response:', JSON.stringify(response, null, 2));
                }
            } else {
                failedCount++;
                console.log(`❌ فشل رفع صورة الفعالية ${numericEventId}`);
                console.log(JSON.stringify(response, null, 2));
            }
        } catch (err) {
            failedCount++;
            console.error(
                `❌ خطأ برفع صورة ID ${eventId}:`,
                err?.message || err
            );
        }

        await sleep(800);
    }

    console.log('');
    console.log('========================================');
    console.log('🖼️ نتيجة رفع الصور');
    console.log(`✅ ناجح: ${successCount}`);
    console.log(`❌ فاشل: ${failedCount}`);
    console.log('========================================');
}

// ============================================================
// البرنامج الرئيسي
// ============================================================

async function main() {
    console.log('');
    console.log('========================================');
    console.log('🐺 WOLF Event Creator');
    console.log('🐺 wolf.js 2.7.10');
    console.log('📦 Tokens from: anaayaar-ops/too');
    console.log('========================================');
    console.log('');

    try {
        // ====================================================
        // 1. قراءة الرموز من GitHub
        // ====================================================

        console.log('🌐 قراءة الرموز من GitHub (too)...');

        const credentials = await loadSession();

        if (!credentials?.token) {
            throw new Error('لم يتم العثور على v3APIToken في tokens.json');
        }

        console.log('✅ تم العثور على توكن WOLF');

        if (credentials.appCheckToken) {
            console.log(
                `🛡️ AppCheck length: ${credentials.appCheckToken.length}`
            );
            console.log('✅ تم العثور على App Check Token');
        } else {
            console.log('⚠️ لا يوجد App Check Token');
        }

        if (credentials.deviceToken) {
            console.log(
                `📱 DeviceToken length: ${credentials.deviceToken.length}`
            );
        }

        console.log(`📱 Device: ${credentials.device || 'web'}`);

        // ====================================================
        // 2. الاتصال باستخدام الرموز
        // ====================================================

        await connectUsingGitHubTokens(credentials);

        // ====================================================
        // 3. تجهيز الصورة
        // ====================================================

        const thumbnailBuffer = await prepareThumbnail();

        // ====================================================
        // 4. جلب الفعاليات الحالية
        // ====================================================

        const existingEvents = await getExistingEvents();

        if (existingEvents === false) {
            console.log('');
            console.log('========================================');
            console.log('ℹ️ لا توجد فعاليات.');
            console.log('↩️ سيتم إرجاع false وإيقاف البرنامج.');
            console.log('========================================');

            await sleep(1000);
            await shutdown(0);
            return false;
        }

        // ====================================================
        // 5. إنشاء الفعاليات
        // ====================================================

        const createdEventIds = await createEvents(existingEvents);

        // ====================================================
        // 6. رفع الصور
        // ====================================================

        await uploadThumbnails(createdEventIds, thumbnailBuffer);

        // ====================================================
        // 7. النهاية
        // ====================================================

        console.log('');
        console.log('========================================');
        console.log('🎉 اكتملت العملية');
        console.log('========================================');
        console.log(`📅 البداية: ${formatDate(START_TIME)}`);
        console.log(`⏱️ مدة الفعالية: ${EVENT_DURATION_MIN} دقيقة`);
        console.log(`🔢 المطلوب: ${TOTAL_EVENTS}`);
        console.log(`✅ تم إنشاء: ${createdEventIds.length}`);
        console.log('========================================');

        await sleep(1500);
        await shutdown(0);

    } catch (err) {
        console.error('');
        console.error('========================================');
        console.error('❌ حصل خطأ');
        console.error('========================================');
        console.error(err?.stack || err?.message || err);
        await shutdown(1);
    }
}

// ============================================================
// إيقاف
// ============================================================

process.on('SIGINT', async () => {
    await shutdown(0);
});

process.on('SIGTERM', async () => {
    await shutdown(0);
});

// ============================================================
// START
// ============================================================

main();
