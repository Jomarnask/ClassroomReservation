# Production Dockerfile for PUP-CRS PHP Backend on Render
FROM php:8.2-cli-alpine

# Install system dependencies & PostgreSQL dev libraries
RUN apk add --no-cache \
    postgresql-dev \
    libpq \
    curl \
    git \
    unzip

# Install and configure PHP extensions
RUN docker-php-ext-install pdo pdo_pgsql curl

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Set working directory inside container
WORKDIR /var/www/html

# Copy composer files first for layer caching
COPY composer.json composer.lock ./

# Install production dependencies only
RUN composer install --no-dev --optimize-autoloader --no-interaction

# Copy backend source code
COPY . .

# Secure file permissions
RUN chmod -R 755 /var/www/html

# Render sets the PORT environment variable dynamically
ENV PORT=8000
EXPOSE 8000

# Start PHP built-in server serving only public/ directory
CMD ["sh", "-c", "php -S 0.0.0.0:${PORT:-8000} -t public public/index.php"]
