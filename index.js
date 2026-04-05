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
    try {
        const isOwner = ctx.from.id === OWNER_ID;
        let user = await User.findOneAndUpdate(
            { telegramId: ctx.from.id },
            { username: ctx.from.username, firstName: ctx.from.first_name },
            { upsert: true, new: true }
        );

        const caption = `👋 *Halo ${ctx.from.first_name}!*\nSelamat datang di *Manzzy ID*.\n\n💰 Saldo: *${formatIDR(user.saldo)}*`;

        // Gunakan TRY CATCH khusus untuk foto
        try {
            await ctx.replyWithPhoto('https://raw.githubusercontent.com/ManzzyGacor/Urlmanzzy/main/file_1775385903372_357.jpg', {
                caption: caption,
                parse_mode: 'Markdown',
                ...mainKeyboard(isOwner)
            });
        } catch (photoError) {
            // Kalau foto gagal, kirim teks aja biar bot nggak mati
            await ctx.reply(caption, {
                parse_mode: 'Markdown',
                ...mainKeyboard(isOwner)
            });
        }
    } catch (err) {
        console.error("ERROR START:", err);
    }
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


// --- HELPER PAGINATION ---
const createPagination = (data, prefix, currentPage = 0, itemsPerPage = 8) => {
    const totalPages = Math.ceil(data.length / itemsPerPage);
    const start = currentPage * itemsPerPage;
    const end = start + itemsPerPage;
    const items = data.slice(start, end);

    const buttons = items.map(item => [
        Markup.button.callback(item.text, `${prefix}_${item.id}`)
    ]);

    const navRow = [];
    if (currentPage > 0) navRow.push(Markup.button.callback('⬅️ Prev', `${prefix}page_${currentPage - 1}`));
    if (currentPage < totalPages - 1) navRow.push(Markup.button.callback('Next ➡️', `${prefix}page_${currentPage + 1}`));
    
    if (navRow.length > 0) buttons.push(navRow);
    buttons.push([Markup.button.callback('🏠 Menu Utama', 'start_menu')]);
    
    return Markup.inlineKeyboard(buttons);
};

// --- 1. LIST SERVICES DENGAN HALAMAN ---
bot.action(/^(list_services|svcpage_(.+))$/, async (ctx) => {
    try {
        const page = ctx.match[2] ? parseInt(ctx.match[2]) : 0;
        await ctx.answerCbQuery();
        
        const res = await roApi.get('/v2/services');
        const services = res.data.data.map(s => ({ text: s.service_name, id: s.service_code }));

        await ctx.editMessageCaption('📱 *Pilih Layanan (Hal ' + (page + 1) + '):*', {
            parse_mode: 'Markdown',
            ...createPagination(services, 'svc', page)
        });
    } catch (e) { ctx.reply('❌ Gagal ambil layanan.'); }
});

// --- 2. PILIH NEGARA & HARGA (PAGINATION) ---
bot.action(/^(svc_(.+)|ctypage_(.+)_(.+))$/, async (ctx) => {
    const serviceId = ctx.match[2] || ctx.match[3]; // Ini ID Aplikasi (misal: 13 untuk WA)
    const page = ctx.match[4] ? parseInt(ctx.match[4]) : 0;

    try {
        await ctx.answerCbQuery('Mencari Negara...');
        const res = await roApi.get(`/v2/countries?service_id=${serviceId}`);
        
        if (!res.data.success) throw new Error('API Error');

        const countries = res.data.data.map(c => {
            // Kita ambil pricelist pertama sebagai default
            const p = c.pricelist[0]; 
            return {
                text: `🌍 ${c.name} (${p.price_format})`,
                // DATA: svcId | numberId | providerId | price | countryName
                id: `${serviceId}_${c.number_id}_${p.provider_id}_${p.price}_${c.name.replace(/ /g, '%20')}`
            };
        });

        await ctx.editMessageCaption(`🌍 *Pilih Negara & Harga (Hal ${page + 1}):*`, {
            parse_mode: 'Markdown',
            ...createPagination(countries, `cty_${serviceId}`, page)
        });
    } catch (e) { 
        ctx.reply('❌ Gagal memuat negara. Pastikan Service ID benar.'); 
    }
});

// --- 3. PILIH OPERATOR (MENGGUNAKAN NAME & PROVIDER_ID) ---
bot.action(/^cty_(.+)_(.+)_(.+)_(.+)_(.+)_(.+)$/, async (ctx) => {
    // Format: cty_SVCID_NUMID_PROVID_PRICE_COUNTRYNAME
    const [_, svcId, numId, provId, price, countryName] = ctx.match;
    
    try {
        await ctx.answerCbQuery('Memuat Operator...');
        
        // Memanggil operator berdasarkan Nama Negara dan Provider ID sesuai dokumentasi
        const url = `/v2/operators?country=${countryName}&provider_id=${provId}`;
        const res = await roApi.get(url);
        
        const textDetail = `🌍 Negara: *${countryName.replace(/%20/g, ' ')}*\n💰 Harga: *Rp ${parseInt(price).toLocaleString('id-ID')}*`;

        if (!res.data.success || !res.data.data || res.data.data.length === 0) {
            // Jika list operator kosong, arahkan ke 'any'
            return ctx.editMessageCaption(`${textDetail}\n\n⚠️ Operator spesifik kosong. Gunakan otomatis?`, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Ya, Pakai Any', `order_${numId}_${provId}_any_${price}`)],
                    [Markup.button.callback('⬅️ Ganti Negara', `svc_${svcId}`)]
                ])
            });
        }

        const buttons = res.data.data.map(op => [
            // Kirim numId (dari negara) bukan svcId ke proses order!
            Markup.button.callback(`📶 Op: ${op.name}`, `order_${numId}_${provId}_${op.id}_${price}`)
        ]);

        buttons.push([Markup.button.callback('⬅️ Kembali', `svc_${svcId}`)]);

        await ctx.editMessageCaption(`⚡ *Pilih Operator:*\n${textDetail}`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
    } catch (e) { 
        ctx.reply('❌ Gagal memuat operator.'); 
    }
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