// Turns the profile photo into dot positions. Edges, skin and hair carry the
// weight; the bright sky behind carries almost none, so the bust reads as a
// drawing made of grains rather than a brightness map.

// Crop and silhouette are tuned to profile-photo.jpg (963 × 825)
const CROP = { x: 110, y: 60, w: 740, h: 765 };
const WIDTH = 200;

const smooth = (edge0, edge1, x) => {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
};

// Rough head ellipse plus shoulders, in crop-normalized coordinates
function silhouette(nx, ny) {
	const head = 1 - smooth(0.85, 1.1, Math.hypot((nx - 0.52) / 0.19, (ny - 0.3) / 0.27));
	const halfWidth = 0.12 + 0.33 * smooth(0.5, 0.68, ny);
	const torso = smooth(0.46, 0.52, ny) * (1 - smooth(halfWidth - 0.03, halfWidth + 0.03, Math.abs(nx - 0.48)));
	return Math.max(head, torso);
}

export async function samplePortrait(url, count) {
	const image = new Image();
	image.src = url;
	await image.decode();

	const width = WIDTH;
	const height = Math.round((WIDTH * CROP.h) / CROP.w);
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	context.drawImage(image, CROP.x, CROP.y, CROP.w, CROP.h, 0, 0, width, height);
	const { data } = context.getImageData(0, 0, width, height);

	const size = width * height;
	const red = new Float32Array(size);
	const green = new Float32Array(size);
	const blue = new Float32Array(size);
	const luma = new Float32Array(size);
	for (let i = 0; i < size; i++) {
		red[i] = data[i * 4] / 255;
		green[i] = data[i * 4 + 1] / 255;
		blue[i] = data[i * 4 + 2] / 255;
		luma[i] = 0.299 * red[i] + 0.587 * green[i] + 0.114 * blue[i];
	}

	const cumulative = new Float64Array(size);
	let total = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = y * width + x;
			let weight = 0;
			if (x > 0 && y > 0 && x < width - 1 && y < height - 1) {
				// Sobel over all three channels, so color edges count too
				let edge = 0;
				for (const channel of [red, green, blue]) {
					const gx = channel[i - width + 1] + 2 * channel[i + 1] + channel[i + width + 1]
						- channel[i - width - 1] - 2 * channel[i - 1] - channel[i + width - 1];
					const gy = channel[i + width - 1] + 2 * channel[i + width] + channel[i + width + 1]
						- channel[i - width - 1] - 2 * channel[i - width] - channel[i - width + 1];
					edge += gx * gx + gy * gy;
				}
				// Skin is the only warm thing in a blue picture
				const warmth = Math.min(1, Math.max(0, (red[i] - blue[i]) * 2.2 - 0.02));
				const hair = smooth(0.3, 0.1, luma[i]);
				weight = 1.5 * smooth(0.12, 0.6, Math.sqrt(edge)) + 0.5 * warmth + 0.8 * hair + 0.08;
				weight *= 0.03 + 0.97 * silhouette(x / width, y / height);
			}
			total += weight;
			cumulative[i] = total;
		}
	}

	const points = new Float32Array(count * 3);
	const aspect = width / height;
	for (let p = 0; p < count; p++) {
		// Inverse-CDF sampling: denser where the weight is higher
		const target = Math.random() * total;
		let low = 0;
		let high = size - 1;
		while (low < high) {
			const mid = (low + high) >> 1;
			if (cumulative[mid] < target) low = mid + 1;
			else high = mid;
		}
		const nx = ((low % width) + Math.random()) / width;
		const ny = (Math.floor(low / width) + Math.random()) / height;
		points[p * 3] = (nx - 0.5) * aspect;
		points[p * 3 + 1] = 0.5 - ny;
		// Relief: the face bulges toward the camera, so parallax gives it volume
		points[p * 3 + 2] = 0.35 * Math.exp(-((nx - 0.51) ** 2 * 10 + (ny - 0.36) ** 2 * 8)) + (luma[low] - 0.5) * 0.08;
	}
	return points;
}
