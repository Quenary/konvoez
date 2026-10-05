# [1.10.0](https://github.com/Quenary/konvoez/compare/v1.9.1...v1.10.0) (2026-10-05)

### Features

- **backend:** announced list, mediasoup port ranges, listenInfos ([f62e052](https://github.com/Quenary/konvoez/commit/f62e0528dd3f3276fb48fb88b3f3f74c1fc8cee3))

## [1.9.1](https://github.com/Quenary/konvoez/compare/v1.9.0...v1.9.1) (2026-10-04)

### Bug Fixes

- **backend:** map malformed multipart uploads to 400 ([7f4bf89](https://github.com/Quenary/konvoez/commit/7f4bf8989480a6b6300bf2e2bcb15e16c2eb5c29))
- **backend:** reject an empty attachment upload body with 400 ([407d79b](https://github.com/Quenary/konvoez/commit/407d79b7ff2abf3dbfd1fb680e3d10d6b9eb7137))
- **backend:** remove partial temp files after a failed upload ([ab37f79](https://github.com/Quenary/konvoez/commit/ab37f7989b5d08e510949052d92ac04f34c295f7))
- **frontend:** bypass the service worker for uploads ([f29f921](https://github.com/Quenary/konvoez/commit/f29f921af5f5fbecfcbebeee794847b5a10cb407))
- **frontend:** explain empty or malformed upload failures ([c11574b](https://github.com/Quenary/konvoez/commit/c11574bae276d1024cb025b34c00dbd5f1d6c9d2))
- **frontend:** upload a slice of picked files for webkit ([5db38d0](https://github.com/Quenary/konvoez/commit/5db38d0d261438ce1b5b8717aac320900800332a))
- **frontend:** upload a slice of the poster too ([a0f12f3](https://github.com/Quenary/konvoez/commit/a0f12f3092489e4da29323e07f8b84aa2d28d6a6))

# [1.9.0](https://github.com/Quenary/konvoez/compare/v1.8.0...v1.9.0) (2026-10-04)

### Bug Fixes

- **attachments:** api docs ([20876a4](https://github.com/Quenary/konvoez/commit/20876a4a596aae032a1abf14151ffbc01d82c6ad))
- **attachments:** enhance error handling in AttachmentUploadInterceptor ([d3fc7da](https://github.com/Quenary/konvoez/commit/d3fc7da01a764d09721dff3547a4e587c02aa822))
- **attachments:** improve attachment upload handling and error management ([0ee5cfc](https://github.com/Quenary/konvoez/commit/0ee5cfc1b44cd5ccb247125595f18c697cee17b1))
- **attachments:** update video processing for poster generation ([d53a058](https://github.com/Quenary/konvoez/commit/d53a058c4e6c6eaf123df6da24013237e26bc7ac))
- **attachments:** uploading, ui in settings form ([53b06eb](https://github.com/Quenary/konvoez/commit/53b06eb7f7de0a92b23c21ab77261d110208d8c1))
- avatar size validation ([9d267da](https://github.com/Quenary/konvoez/commit/9d267da0eee266fe955ec4092fd4d8d0af95c05d))
- **backend:** handle zero-second client duration hint in attachments service ([f09c8b4](https://github.com/Quenary/konvoez/commit/f09c8b41b79b123bc0c97be1c1fe510e6f4fda7f))
- **backend:** ignore multiline ffmpeg metadata as ENOSPC ([26c0afc](https://github.com/Quenary/konvoez/commit/26c0afc1cf2c0275f3ded63119213c98229266d8))
- **frontend:** attach button style ([ef97820](https://github.com/Quenary/konvoez/commit/ef9782089e467fab66d7f7f8a3d1f1a065fd94e1))
- **frontend:** audio activity on mobile ([d01722d](https://github.com/Quenary/konvoez/commit/d01722db403d70d49211bd58178a2749f5c0a51b))
- **frontend:** dbl downloadable file name ([7c53903](https://github.com/Quenary/konvoez/commit/7c539030fc9e48c2db22dfe5801133b94205185b))
- **frontend:** drop peer playback if the peer leaves during attach ([beb1bdb](https://github.com/Quenary/konvoez/commit/beb1bdb22d7e9e27d85f2fa92f0dbf153ffbbd8d))
- **frontend:** ensure proper closure of producer tracks on end event ([2064d24](https://github.com/Quenary/konvoez/commit/2064d24e8cee42b35d128fe8e130ffc84c2c5da4))
- **frontend:** fix the screen wake lock acquire race ([23f984f](https://github.com/Quenary/konvoez/commit/23f984fb7adc3daaf098e3eabfbfea92aea40494))
- **frontend:** handle microphone release and socket timeout on voice session leave ([63270b6](https://github.com/Quenary/konvoez/commit/63270b6d01fb896cd0599267524db4f0716a41e8))
- **frontend:** hydrate voice mute from storage, unregister on logout ([228630e](https://github.com/Quenary/konvoez/commit/228630ed3d677ac070dc641bf29b63e23860c1bf))
- **frontend:** join-time mute overwritten by stale param ([51cee74](https://github.com/Quenary/konvoez/commit/51cee745dc56c2a9902c19c667a73cb6a014b9e3))
- **frontend:** leave voice before navigating away on logout ([71b31cd](https://github.com/Quenary/konvoez/commit/71b31cde72d644e08f66a285feb13e39ed633cd3))
- **frontend:** mic/produce race on devicechange (ios, permission) ([21c85db](https://github.com/Quenary/konvoez/commit/21c85db8c93e35e08f73aa65e25f9ddc593276ae))
- **frontend:** notify when joining a voice room fails ([263c34d](https://github.com/Quenary/konvoez/commit/263c34dc5d30fa9da5128764f6ee0eb3b3fd2e59))
- **frontend:** paint a video poster only when a frame is ready ([3fc3224](https://github.com/Quenary/konvoez/commit/3fc3224c41e32d0430b9fc5d02282f73558237a3))
- **frontend:** play button contrast ([4dcba1d](https://github.com/Quenary/konvoez/commit/4dcba1d1f8e023214e8278b6d8af8a05619e2e2d))
- **frontend:** safari/ios webp encoding fallback ([0ba277c](https://github.com/Quenary/konvoez/commit/0ba277cfe01cdc1867ed19141a4472b06c0056e9))
- **frontend:** scroll to bottom button appearance ([07258c6](https://github.com/Quenary/konvoez/commit/07258c61f64a5326a34f4f2e324e8c6fa7f32b26))
- **frontend:** serialize mic produce, replace track, report join failure ([9ed6fd8](https://github.com/Quenary/konvoez/commit/9ed6fd80c5946ad86731a5f98b54ce7cae43f3d3))
- **frontend:** text room input height ([60557f1](https://github.com/Quenary/konvoez/commit/60557f124ce6b88975de8034c0fbbdbaaff741bc))
- message deletion behavior ([9286680](https://github.com/Quenary/konvoez/commit/9286680a3ca471e31acb92833b4052652b9613f6))

### Features

- **attachments:** add video processing service and poster generation ([8071619](https://github.com/Quenary/konvoez/commit/807161978194c0d8ec434e53bc9f187c1ec8ac97))
- **attachments:** composer, upload pipeline on frontend ([fb415f3](https://github.com/Quenary/konvoez/commit/fb415f3a03e5cbe65140dc8d40e87a0753db1130))
- **attachments:** enhance attachment cleanup and file stat functionality ([cb4ef93](https://github.com/Quenary/konvoez/commit/cb4ef933b5907a43bd6141d37696073ba97a8772))
- **attachments:** entity, upload/download api, infra, display ([41e37ee](https://github.com/Quenary/konvoez/commit/41e37eef56be40d65ee9b9fbc4a6802bdc4df0f3))
- **attachments:** improve video poster generation and processing limits ([e7e0374](https://github.com/Quenary/konvoez/commit/e7e037417f67d75fdb0776ebf90b24edfb725028))
- **attachments:** shared, settings, storage layer ([8029e4b](https://github.com/Quenary/konvoez/commit/8029e4b8fd4cf418ea48315b5d217c90b5e219cd))
- **attachments:** text input assets scroll indication ([e2f3513](https://github.com/Quenary/konvoez/commit/e2f351389aecf1e2a34c4e42ce90b4ba5c14b47b))
- client posters, optional ffmpeg ([ffd8224](https://github.com/Quenary/konvoez/commit/ffd82240a4734c138c14db9e1fd539a169076c91))
- **frontend:** message balloon match prime media width ([78bbd33](https://github.com/Quenary/konvoez/commit/78bbd33bf75343e9349197c10d8fa5e550511b92))
- **frontend:** screen wake lock on active voice room ([b55a596](https://github.com/Quenary/konvoez/commit/b55a596a9c1566933c06ad3bfebf9bb2851a265a))
- **frontend:** scroll on new message if already on the bottom ([a96fbf3](https://github.com/Quenary/konvoez/commit/a96fbf3c14b47784b925eefc414f0b6f74dfc7a2))
- **frontend:** shortened dt for today's messages ([786b485](https://github.com/Quenary/konvoez/commit/786b48501ebfbfd63d44b30ebb0b1ddbc0f5af93))

# [1.8.0](https://github.com/Quenary/konvoez/compare/v1.7.0...v1.8.0) (2026-10-01)

### Features

- **frontend:** add PWA update dialog ([cd072ce](https://github.com/Quenary/konvoez/commit/cd072ceabe7b1fecfcf431e475bffec1b2cb2019))
- **rooms:** rooms context menu as component, reuse in rooms headers, side menu opens menu on rightclick/longtap ([1251c80](https://github.com/Quenary/konvoez/commit/1251c8020c9c066c4e03daaddfa6d00d1ff343cb))

# [1.7.0](https://github.com/Quenary/konvoez/compare/v1.6.0...v1.7.0) (2026-09-30)

### Bug Fixes

- **frontend:** background color ([1d848f0](https://github.com/Quenary/konvoez/commit/1d848f078767b9892a0764acb1a9e439f26c711c))
- **frontend:** message appearance, resend ([9732c33](https://github.com/Quenary/konvoez/commit/9732c33b2b0e3a2512499cc4738408506b42e011))
- **frontend:** user-management display deletedAt ([00d93b2](https://github.com/Quenary/konvoez/commit/00d93b2050e84ab5a7c3bb1b6277bac927974e90))
- **profile:** profile form button change detection ([42bfa86](https://github.com/Quenary/konvoez/commit/42bfa8600721c9247974dcda22e2fe52f6cdae14))
- **rooms:** room management access control ([e06734f](https://github.com/Quenary/konvoez/commit/e06734f82bd57278a623c20cee991357110f47c0))

### Features

- **entity-sync:** implement real-time user and room synchronization with event emitters ([a9b8d80](https://github.com/Quenary/konvoez/commit/a9b8d805736d565961e2c942a2a0816f38c6f25c))
- **frontend:** initial setup dialog ([7b1c64c](https://github.com/Quenary/konvoez/commit/7b1c64ca87c55a8de5290f8508a7f82d479e25b7))
- **frontend:** room dialog display detailed info ([b39a640](https://github.com/Quenary/konvoez/commit/b39a64046e7d21dbf728f0151a261da0b473e714))
- **profile:** add self-anonymize and delete functionality ([36db56e](https://github.com/Quenary/konvoez/commit/36db56e2f9f0e1c094124105032e72ac0d48dfeb))
- smtp, password recovery ([216e039](https://github.com/Quenary/konvoez/commit/216e039d4df11fa6964c2951568b43bb8c3123dc))
- user management ([1beee38](https://github.com/Quenary/konvoez/commit/1beee389567c2b7fb9ecd674994e6da688c7a58e))

# [1.6.0](https://github.com/Quenary/konvoez/compare/v1.5.1...v1.6.0) (2026-09-28)

### Bug Fixes

- **frontend:** get active voice peers on initial load ([9404ba8](https://github.com/Quenary/konvoez/commit/9404ba8dc855ba27945b5415eb25d5e72e5b9784))
- **frontend:** side menu align ([5cb88eb](https://github.com/Quenary/konvoez/commit/5cb88ebf53fbfb032a44faf442734b210adc8169))
- **voice:** edge-case race conditions ([d3b6785](https://github.com/Quenary/konvoez/commit/d3b67854f0dcb3de659607ee6e0d0b35ff944c03))

### Features

- add versioning endpoint and GitHub release check ([4edf74d](https://github.com/Quenary/konvoez/commit/4edf74dcaa2099c8e5dbb79470f8679e38a9b157))
- **backend:** implement orphan file cleanup ([8478cd5](https://github.com/Quenary/konvoez/commit/8478cd512e06ed1d053a5e409849a3ad81036bd3))
- direct calls ([fba9b0b](https://github.com/Quenary/konvoez/commit/fba9b0b68e700ad137f9890df1ef16d5602212bd))
- **frontend:** pulse indication on active voice room ([d59f2f2](https://github.com/Quenary/konvoez/commit/d59f2f2f04d0fff9abc6b90eabd9735b728fa4ad))

## [1.5.1](https://github.com/Quenary/konvoez/compare/v1.5.0...v1.5.1) (2026-09-24)

### Bug Fixes

- **frontend:** load of mediasoup library ([f7eb0b2](https://github.com/Quenary/konvoez/commit/f7eb0b243405ccfcb01323c63d10acf15a7ca873))
- **frontend:** side menu styles ([7a3b237](https://github.com/Quenary/konvoez/commit/7a3b237b97f8ee5f8a60934f6cd71758b691e40b))

# [1.5.0](https://github.com/Quenary/konvoez/compare/v1.4.0...v1.5.0) (2026-09-23)

### Bug Fixes

- **backend:** throw 409 on room constraint error ([1af9a4d](https://github.com/Quenary/konvoez/commit/1af9a4d471db4f1a3df032a786443d1d5a6f1330))
- **frontend:** direct messages handling while in common room ([012d8e1](https://github.com/Quenary/konvoez/commit/012d8e184650fc6bd3c995371b9ff88e877244ee))
- **frontend:** release audio streams ([640512a](https://github.com/Quenary/konvoez/commit/640512a60f2482429f7d0fa1bc02bf8d8d860abb))
- **frontend:** text input validation ([d5d74f0](https://github.com/Quenary/konvoez/commit/d5d74f0b6d41e0792957fed1f1d168ca9ade2c55))

### Features

- notifications ([526b95a](https://github.com/Quenary/konvoez/commit/526b95aa0a181bd5cfea8b6e3b054f090db8bc7b))
- **pwa:** update deps, add sw, icons, fix types ([8dfec47](https://github.com/Quenary/konvoez/commit/8dfec4770ef505b1099f567b586771a13c6ef518))

# [1.4.0](https://github.com/Quenary/konvoez/compare/v1.3.0...v1.4.0) (2026-09-22)

### Features

- direct chats ([6af1668](https://github.com/Quenary/konvoez/commit/6af1668a9fd4f55732751cec2bee87ee02d3ceef))
- message read stats, badges ([0b74445](https://github.com/Quenary/konvoez/commit/0b744454229f5183eccaf5cdb1bae22cc7ee809a))
- message styles (direct, self, others) ([9e8a80c](https://github.com/Quenary/konvoez/commit/9e8a80c499259f5810b5abd4fcd0a87d6bc0a62a))

# [1.3.0](https://github.com/Quenary/konvoez/compare/v1.2.0...v1.3.0) (2026-09-17)

### Bug Fixes

- **frontend:** preserve auth ([2e64c3a](https://github.com/Quenary/konvoez/commit/2e64c3a8af0e8d480b36b9e9ba2f7c3498af0aac))

### Features

- message search ([bba3459](https://github.com/Quenary/konvoez/commit/bba3459927a8f85c590b1875be46b246d92cc416))
- process avatars before save, use sharp, save compressed webp ([c96a56b](https://github.com/Quenary/konvoez/commit/c96a56b9d5957c72e62a9698f000e85af9644ed5))

# [1.2.0](https://github.com/Quenary/konvoez/compare/v1.1.0...v1.2.0) (2026-09-17)

### Bug Fixes

- **backend:** validate unique email (409) ([2b50d7b](https://github.com/Quenary/konvoez/commit/2b50d7bae869d4baf8e10cca48af4b3aecd59abb))
- frontend initial load in insecure context ([b71db09](https://github.com/Quenary/konvoez/commit/b71db0933e360d9b9a2130d0f4c1a4f649321820))
- **frontend:** optimize bundle size ([4ef0b8c](https://github.com/Quenary/konvoez/commit/4ef0b8cce05caa3324f3f25a2b6764ec7f33a8f7))
- **frontend:** reset message input on send ([425d1dd](https://github.com/Quenary/konvoez/commit/425d1dd51834c5bbadf93b8e0f82b488f8cfc9a4))
- **frontend:** SETTINGS.ADMIN.SAVED_SUCCESS translation ([e542a74](https://github.com/Quenary/konvoez/commit/e542a747e45aee10d85691a09dc5ec6269578e05))
- settings update ([ac78596](https://github.com/Quenary/konvoez/commit/ac7859638a96669600fa32ccba03532c216479e0))

### Features

- favicon ([822e01e](https://github.com/Quenary/konvoez/commit/822e01efa80cf7f19fc9c9d9562fbb5ba5616ebb))

# [1.1.0](https://github.com/Quenary/konvoez/compare/v1.0.0...v1.1.0) (2026-09-16)

### Bug Fixes

- **i18n:** en translation, typos ([faeb36b](https://github.com/Quenary/konvoez/commit/faeb36be95df83692d1f2ea1595f4590233b6e83))
- **profile:** ngSrc priority error ([c477860](https://github.com/Quenary/konvoez/commit/c477860559e7fd603391654ffc399abbeefe8016))

### Features

- apply ice servers from settings, refactor settings ([ce2fccb](https://github.com/Quenary/konvoez/commit/ce2fccbb3809625dcb21f3ff95d978246895c282))
- **frontend:** settings-admin ice servers placeholder ([3c99c6a](https://github.com/Quenary/konvoez/commit/3c99c6a34468c5cba32fe2d2e5e04391ba4af25a))
- initial reg of `owner` requires token ([fe71eec](https://github.com/Quenary/konvoez/commit/fe71eec7a51d9dd055317a841d007d50eb4c9b66))
- invite only sign-up ([157bb13](https://github.com/Quenary/konvoez/commit/157bb13e73a773493fe1df5856d7e14421c6dde0))
- sqlite with wal ([e29d079](https://github.com/Quenary/konvoez/commit/e29d0790c32560d96bca3ab3086c7bb3cdc72aaa))

# 1.0.0 (2026-09-15)

### Bug Fixes

- analyser level when muted ([b7219fc](https://github.com/Quenary/konvoez/commit/b7219fc2cfe733d23a4336486fddb912a6387b29))
- auth/settings styles ([9e9b835](https://github.com/Quenary/konvoez/commit/9e9b835555dfd12b5a2c2b2af4f751fc0628e903))
- **backend:** run migrations on startup ([3dcbfc0](https://github.com/Quenary/konvoez/commit/3dcbfc0dc060fc8b2fd4e7999d9b5bf17ed6f1dc))
- chat messages loading on scroll ([a1ea2fc](https://github.com/Quenary/konvoez/commit/a1ea2fcc6d777e3726ae7abd6d69bd9ae34db1c8))
- frontend prettier cfg (use root cfg) ([578c708](https://github.com/Quenary/konvoez/commit/578c7089bfd8efaa5c474ce97c21438f0a2a936d))
- **frontend:** do not leave room on select same room ([ddcff04](https://github.com/Quenary/konvoez/commit/ddcff043a31fa1c57a5960033246dcede28b2695))
- **frontend:** img ngSrc priority ([7731f89](https://github.com/Quenary/konvoez/commit/7731f89170b49ecfc3a7e4698965260266cc2f44))
- **frontend:** mic produce error, lint errors ([6d1afa8](https://github.com/Quenary/konvoez/commit/6d1afa8f78fbf9a9cad1784dd2f50dd21a8dfc44))
- **frontend:** mute audio, related mute for mic/speakers ([00cecd1](https://github.com/Quenary/konvoez/commit/00cecd1247a056fb34c8fb5dcc6ac38306f676d9))
- **frontend:** rerequest avatar url on peers update ([17f6aea](https://github.com/Quenary/konvoez/commit/17f6aea1e6446d2f3a7f04f673f67d8298ae489c))
- **frontend:** talking indication ([ef87913](https://github.com/Quenary/konvoez/commit/ef87913cd20e7b0b60f4ed9239fd8495cd027c80))
- **frontend:** voice peers, styles ([84d3450](https://github.com/Quenary/konvoez/commit/84d345050943224a70a1ebe5f3aa2de45ca26d51))
- highlight CLICK_TO_SELECT ([3a2e3b3](https://github.com/Quenary/konvoez/commit/3a2e3b3b1ef45ad00250353a740ae5f896a2367f))
- logout ([4ecb75d](https://github.com/Quenary/konvoez/commit/4ecb75df8b842e45e0eb6105cfe4514fab6da4ae))
- messages styles ([c790222](https://github.com/Quenary/konvoez/commit/c790222c1ca416fa03b9b11ee4a20d7c3ea576a7))
- navigate to / if authorized ([f56cf83](https://github.com/Quenary/konvoez/commit/f56cf83ca7c6bb91ac8ea24e0e1a3832dfd49460))
- refresh token req ([cb7c2ed](https://github.com/Quenary/konvoez/commit/cb7c2edbd36f998ac76d41075bfdf95985740bcd))
- replace UserEntity with GetUserDto from @Author decorator ([594085e](https://github.com/Quenary/konvoez/commit/594085e3cfa4da0c51e96ddb742370424efdcffe))
- ws crush by http exception ([c8dc366](https://github.com/Quenary/konvoez/commit/c8dc366ed2617b6d02c5d38eaae54a71f94e8d6b))

### Features

- add file service supporting local and S3 object storage with avatar management features ([c901752](https://github.com/Quenary/konvoez/commit/c901752cc5779c211ab9d447ea814f3e8b0a5f45))
- avatars ([ae68fd3](https://github.com/Quenary/konvoez/commit/ae68fd393d98a7237ee3e885398b1e55edf17042))
- **backend:** app editable settings ([3354e5c](https://github.com/Quenary/konvoez/commit/3354e5c0cd0fc65143aa42fc9e9ed3ee520dd4d5))
- components, auth form, api guards, api docs, base entity, ([d803d7c](https://github.com/Quenary/konvoez/commit/d803d7c267f7f9ec70f6d47c9ae91c68643b1a7a))
- cursor based message chunks ([5b1e657](https://github.com/Quenary/konvoez/commit/5b1e65761e67294c33438dbf84a1ef0da1fa6792))
- dev s3 via s3rver ([8df3552](https://github.com/Quenary/konvoez/commit/8df355254d36e62606b13c3cd4c53b3ca5399a9a))
- device selection, storageJson, ([c5ebf5a](https://github.com/Quenary/konvoez/commit/c5ebf5ae5a57e6a882d6c606b28dbaf3437448f8))
- docker deployment ([599ed03](https://github.com/Quenary/konvoez/commit/599ed030adba3ab117c396d7814b53f834cd1e21))
- edit/delete room, mixins ([5cd9846](https://github.com/Quenary/konvoez/commit/5cd9846f2ca21c5012bd29e581e6631674a842df))
- **frontend:** send on enter ([ddbe214](https://github.com/Quenary/konvoez/commit/ddbe2144d2fd3e28bab314dc6e801455eb782228))
- **frontend:** users store ([2b09858](https://github.com/Quenary/konvoez/commit/2b09858ec2ad5200b5b3348ad3ae78e24ce59867))
- mediasoup ([6e078ea](https://github.com/Quenary/konvoez/commit/6e078eab494b5b4d63e32360ad0ec8c9d6cb2ac6))
- mediasoup ([1bde6ff](https://github.com/Quenary/konvoez/commit/1bde6ffd7a903823ab0eefad2c176f8d924faa4c))
- message edit, delete ([6c724c0](https://github.com/Quenary/konvoez/commit/6c724c0efe5f29d97ae3b78083baff63fc584f97))
- message encryption ([0875f24](https://github.com/Quenary/konvoez/commit/0875f249d654466ddc37e128f54ecfbbbd973e4d))
- messages with tiptap editor ([f4e116a](https://github.com/Quenary/konvoez/commit/f4e116a0e261788cc2a5b908ec1329872a66ff8f))
- microphone/speaker service, active speaker visualization, noise suppression, ([ed206d1](https://github.com/Quenary/konvoez/commit/ed206d1a8596db3d7bd6c126ef48471d7343134d))
- preserve mute state ([24a7545](https://github.com/Quenary/konvoez/commit/24a75453855c289cd90dd98792673bc79a4b0b3b))
- register, common code, cookie-parser ([c4a0294](https://github.com/Quenary/konvoez/commit/c4a02948378ce812632488c29cf3653db22b82d2))
- reply to ([06369c9](https://github.com/Quenary/konvoez/commit/06369c9b541e923088250edaa3de9a5b9d968241))
- rooms avatars ([1c413d3](https://github.com/Quenary/konvoez/commit/1c413d330a64fddcdb56d3f7e694a93a4ca1134a))
- rooms, add room dialog ([e89d04b](https://github.com/Quenary/konvoez/commit/e89d04b59f83cde1e0b274125f1bf6659f450987))
- sfx ([7c7d9f3](https://github.com/Quenary/konvoez/commit/7c7d9f320a59dbe053bb1e9166b8bf5e1e575443))
- text room ([093669c](https://github.com/Quenary/konvoez/commit/093669c0c05bdc04d433524afdb79fe8921da85f))
- user auto color ([fbe4418](https://github.com/Quenary/konvoez/commit/fbe44181184c6c241385b6c3104c4ade8976019e))
- users, rooms, auth (partial) ([88ad9e7](https://github.com/Quenary/konvoez/commit/88ad9e7e37d260fe2965befe3481fec3483d8e2f))
- voice-room.service, audiocontext ([1669230](https://github.com/Quenary/konvoez/commit/16692305325ac3d5ac0f5434a433d90ad69d7491))
- ws auth, common ns for ws, menu, logout, ([c857571](https://github.com/Quenary/konvoez/commit/c85757171831e9d8cb68aee906b8b30bb99e63bd))
- zod shared schemas ([cb909ee](https://github.com/Quenary/konvoez/commit/cb909ee2fd95e8788b0e2483daa4742fc670b2a4))
