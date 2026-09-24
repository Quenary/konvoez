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
