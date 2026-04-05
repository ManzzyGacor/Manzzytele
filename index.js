const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const OWNER_ID = 7533630775;
const RO_API_KEY = process.env.RO_API_KEY;
const RO_BASE_URL = 'https://www.rumahotp.io/api';

// --- DATABASE SCHEMA ---
mongoose.connect(process.env.MONGO_URI);
const User = mongoose.model('User', new mongoose.Schema({
    telegramId: { type: Number, unique: true },
    username: String,
    firstName: String,
    saldo: { type: Number, default: 0 },
    role: { type: String, default: 'Member' },
    isBanned: { type: Boolean, default: false }
}));

const roApi = axios.create({
    baseURL: RO_BASE_URL,
    headers: { 'x-apikey': RO_API_KEY, 'Accept': 'application/json' }
});

// --- HELPER ---
const formatIDR = (val) => `Rp ${val.toLocaleString('id-ID')}`;

// --- MENU BUTTONS ---
const mainKeyboard = (isAdmin) => {
    const btns = [
        [Markup.button.callback('🛍️ Beli Nokos', 'list_services'), Markup.button.callback('💰 Isi Saldo', 'deposit')],
        [Markup.button.callback('👤 Profil', 'profile'), Markup.button.callback('🆘 Bantuan', 'support')]
    ];
    if (isAdmin) btns.push([Markup.button.callback('🛠️ Panel Owner', 'owner_panel')]);
    return Markup.inlineKeyboard(btns);
};

// --- LOGIKA UTAMA ---

bot.start(async (ctx) => {
    const isOwner = ctx.from.id === OWNER_ID;
    let user = await User.findOneAndUpdate(
        { telegramId: ctx.from.id },
        { username: ctx.from.username, firstName: ctx.from.first_name, role: isOwner ? 'Owner' : 'Member' },
        { upsert: true, new: true }
    );

    await ctx.replyWithPhoto('https://telegra.ph/file/your-image.jpg', {
        caption: `👋 *Halo ${ctx.from.first_name}!*\nSelamat datang di *Manzzy ID*.\n\n💰 Saldo: *${formatIDR(user.saldo)}*\n🆔 ID: \`${ctx.from.id}\``,
        parse_mode: 'Markdown',
        ...mainKeyboard(isOwner)
    });
});

// --- FITUR OWNER (ADD SALDO) ---
// Perintah: /addsaldo [ID] [Jumlah]
bot.command('addsaldo', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) return ctx.reply('Format: /addsaldo [ID] [Jumlah]');

    const targetId = parseInt(args[1]);
    const amount = parseInt(args[2]);

    const updated = await User.findOneAndUpdate({ telegramId: targetId }, { $inc: { saldo: amount } }, { new: true });
    if (updated) {
        ctx.reply(`✅ Berhasil! Saldo ${updated.firstName} bertambah. Total: ${formatIDR(updated.saldo)}`);
        bot.telegram.sendMessage(targetId, `💰 Saldo Anda telah ditambahkan sebesar *${formatIDR(amount)}* oleh Admin!`, { parse_mode: 'Markdown' });
    } else {
        ctx.reply('❌ User tidak ditemukan di database.');
    }
});

// --- PANEL OWNER (CEK SALDO PUSAT) ---
bot.action('owner_panel', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return ctx.answerCbQuery('Akses Ditolak!');
    try {
        const res = await roApi.get('/v1/user/balance');
        const bal = res.data.data;
        await ctx.editMessageCaption(`👑 *OWNER PANEL - Manzzy ID*\n\n💰 Saldo Pusat (RO): *${bal.formated}*\n📧 Email RO: ${bal.email}\n\n*Fitur Cepat:* \n/addsaldo [ID] [Jumlah]\n/ban [ID]`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali', 'start_menu')]])
        });
    } catch (e) { ctx.reply('Gagal cek saldo pusat.'); }
});

// --- SISTEM BANTUAN (BOT CHAT) ---
bot.action('support', async (ctx) => {
    await ctx.editMessageCaption('📝 *Sistem Tiket Bantuan*\n\nSilakan ketik pesan/kendala Anda di sini. Pesan Anda akan langsung terkirim ke Owner.', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batal', 'start_menu')]])
    });
    // Set session atau state user sedang mode bertanya (bisa pakai session middleware, tapi ini cara simpelnya)
    return ctx.answerCbQuery();
});

// Menangani pesan teks yang bukan perintah (Untuk Chat Support)
bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return; // Abaikan perintah

    // Jika Owner membalas pesan terusan (Reply pesan dari bot)
    if (ctx.from.id === OWNER_ID && ctx.message.reply_to_message) {
        const originalMsg = ctx.message.reply_to_message.text;
        const targetUserId = originalMsg.match(/User ID: (\d+)/)?.[1];
        
        if (targetUserId) {
            await bot.telegram.sendMessage(targetUserId, `💬 *Balasan dari Owner:*\n\n${ctx.message.text}`, { parse_mode: 'Markdown' });
            return ctx.reply('✅ Balasan terkirim ke user.');
        }
    }

    // Jika User mengirim pesan ke Bot (Support)
    if (ctx.from.id !== OWNER_ID) {
        await ctx.reply('🚀 Pesan Anda telah terkirim ke Owner. Tunggu balasan ya!');
        await bot.telegram.sendMessage(OWNER_ID, `📩 *PESAN BANTUAN BARU*\n\nDari: ${ctx.from.first_name} (@${ctx.from.username})\nUser ID: ${ctx.from.id}\n\nPesan:\n${ctx.message.text}`, { parse_mode: 'Markdown' });
    }
});

// Menu Kembali
bot.action('start_menu', async (ctx) => {
    const isOwner = ctx.from.id === OWNER_ID;
    const user = await User.findOne({ telegramId: ctx.from.id });
    await ctx.editMessageCaption(`👋 *Main Menu Manzzy ID*\n\n💰 Saldo: *${formatIDR(user.saldo)}*`, {
        parse_mode: 'Markdown',
        ...mainKeyboard(isOwner)
    });
});


// STEP 1: Ambil Daftar Layanan
bot.action('list_services', async (ctx) => {
    try {
        await ctx.answerCbQuery('Memuat Layanan...');
        const res = await roApi.get('/v2/services');
        if (!res.data.success) throw new Error('Gagal ambil layanan');

        const buttons = res.data.data.map(s => [Markup.button.callback(s.service_name, `svc_${s.service_code}`)]);
        
        await ctx.editMessageCaption('📱 *Pilih Aplikasi/Layanan:*', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
    } catch (e) { ctx.reply('❌ Error: ' + e.message); }
});

// STEP 2: Pilih Negara (Berdasarkan Service ID)
bot.action(/^svc_(.+)$/, async (ctx) => {
    const serviceId = ctx.match[1];
    try {
        await ctx.answerCbQuery('Mencari Negara...');
        const res = await roApi.get(`/v2/countries?service_id=${serviceId}`);
        
        // Ambil 10 negara pertama agar tidak error "Message too long"
        const buttons = res.data.data.slice(0, 10).map(c => [
            Markup.button.callback(`${c.name} (${c.pricelist[0].price_format})`, `cty_${serviceId}_${c.name}_${c.pricelist[0].provider_id}_${c.pricelist[0].price}`)
        ]);

        await ctx.editMessageCaption('🌍 *Pilih Negara & Harga:*', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([...buttons, [Markup.button.callback('⬅️ Kembali', 'list_services')]])
        });
    } catch (e) { ctx.reply('❌ Gagal memuat negara.'); }
});

// STEP 3: Pilih Operator
bot.action(/^cty_(.+)_(.+)_(.+)_(.+)$/, async (ctx) => {
    const [_, svcId, country, provId, price] = ctx.match;
    try {
        await ctx.answerCbQuery('Memuat Operator...');
        const res = await roApi.get(`/v2/operators?country=${country}&provider_id=${provId}`);
        
        const buttons = res.data.data.map(op => [
            Markup.button.callback(`Operator: ${op.name}`, `order_${svcId}_${provId}_${op.id}_${price}`)
        ]);

        await ctx.editMessageCaption(`⚡ *Pilih Operator untuk ${country}:*\nHarga: ${formatRupiah(price)}`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
    } catch (e) { ctx.reply('❌ Gagal memuat operator.'); }
});

// STEP 4: Proses Order (Potong Saldo & Hit API)
bot.action(/^order_(.+)_(.+)_(.+)_(.+)$/, async (ctx) => {
    const [_, numId, provId, opId, price] = ctx.match;
    const userId = ctx.from.id;

    try {
        // Cek Saldo Internal User
        const user = await User.findOne({ telegramId: userId });
        if (user.saldo < parseInt(price)) return ctx.answerCbQuery('❌ Saldo tidak cukup!', { show_alert: true });

        await ctx.editMessageCaption('⏳ Sedang memproses pesanan...');
        
        // Hit API Order RumahOTP
        const orderRes = await roApi.get(`/v2/orders?number_id=${numId}&provider_id=${provId}&operator_id=${opId}`);
        
        if (orderRes.data.success) {
            const order = orderRes.data.data;
            
            // Potong Saldo
            user.saldo -= parseInt(price);
            await user.save();

            const orderMsg = `✅ *Pesanan Berhasil!*\n\n` +
                             `📱 Layanan: *${order.service}*\n` +
                             `📞 Nomor: \`${order.phone_number}\`\n` +
                             `🆔 Order ID: \`${order.order_id}\`\n\n` +
                             `🕒 _Silakan tunggu OTP masuk..._`;

            await ctx.reply(orderMsg, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📩 Cek OTP', `status_${order.order_id}`)],
                    [Markup.button.callback('❌ Batalkan', `cancel_${order.order_id}`)]
                ])
            });
        }
    } catch (e) { ctx.reply('❌ Gagal Order: ' + (e.response?.data?.message || e.message)); }
});

// STEP 5: Cek Status OTP
bot.action(/^status_(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    try {
        const res = await roApi.get(`/v1/orders/get_status?order_id=${orderId}`);
        const data = res.data.data;

        if (data.otp_code) {
            await ctx.reply(`📩 *OTP DITERIMA!*\n\nKode: \`${data.otp_code}\`\nPesan: \`${data.otp_msg}\``, { parse_mode: 'Markdown' });
        } else {
            await ctx.answerCbQuery('Belum ada OTP masuk. Tunggu ya!', { show_alert: true });
        }
    } catch (e) { ctx.answerCbQuery('Gagal cek status.'); }
});

// STEP 6: Batalkan Pesanan (Refund Saldo)
bot.action(/^cancel_(.+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    try {
        const res = await roApi.get(`/v1/orders/set_status?order_id=${orderId}&status=cancel`);
        if (res.data.success) {
            // Logika refund saldo bisa ditaruh di sini jika status benar-benar cancel
            await ctx.reply('🚫 Pesanan dibatalkan.');
        }
    } catch (e) { ctx.answerCbQuery('Gagal membatalkan.'); }
});


// --- 4. RUN BOT ---
bot.launch().then(() => {
  console.log('🚀 Bot Manzzy ID sudah online!');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));