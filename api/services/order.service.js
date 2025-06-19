const { sequelize } = require('../libs/sequelize');
const boom = require('@hapi/boom');

class OrderService {
    constructor() {
        this.Order = sequelize.models.Order;
        this.OrderItem = sequelize.models.OrderItem;
        this.Product = sequelize.models.Product;
        this.Carrier = sequelize.models.Carrier;
    }    async create(body) {
        //antes de crear la orden se debe verificar que los productos existan
        //y que la cantidad solicitada no sea mayor a la cantidad en inventario
        //y asignar a currierId aleatoriamente un transportista los que existan en la tabla carriers

        const products = body.orderItems.map(orderItem => orderItem.productId);
        const productsFound = await this.Product.findAll({
            where: {
                id: products
            }
        });

        if (productsFound.length !== products.length) {
            throw boom.badRequest('Some products not found');
        }

        // Crear un mapa de productos para fácil acceso
        const productMap = {};
        productsFound.forEach(product => {
            productMap[product.id] = product;
        });

        // Verificar stock y preparar orderItems con unitPrice
        const orderItemsData = [];
        for (const item of body.orderItems) {
            const product = productMap[item.productId];
            if (product.stock < item.quantity) {
                throw boom.badRequest(`Product ${product.name} out of stock`);
            }
            orderItemsData.push({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: product.price, // Guardar el precio actual del producto
            });
        }

        const carriers = await this.Carrier.findAll();
        const carrier = carriers[Math.floor(Math.random() * carriers.length)];

        const orderPayload = {
            userId: body.userId,
            carrierId: carrier.id,
            orderItems: orderItemsData,
        };

        const order = await this.Order.create(orderPayload, {
            include: ['orderItems']
        });

        // Actualizar stock de productos
        for (const item of body.orderItems) {
            const product = productMap[item.productId];
            await product.update({
                stock: product.stock - item.quantity
            });
        }

        return order;
    }

    async find() {
        return this.Order.findAll({
            include: [
                {
                    model: this.OrderItem,
                    as: 'orderItems',
                    include: ['product']
                },
                'user',
                'carrier'
            ]
        });
    }

    async findOne(id) {
        const order = await this.Order.findByPk(id, {
            include: [
                {
                    model: this.OrderItem,
                    as: 'orderItems',
                    include: ['product']
                },
                'user',
                'carrier'
            ]
        });
        if (!order) {
            throw boom.notFound('Order not found');
        }
        return order;
    }

    async findLast() {
        return this.Order.findOne({
            order: [['createdAt', 'DESC']],
            include: [
                {
                    model: this.OrderItem,
                    as: 'orderItems',
                    include: ['product']
                },
                'user',
                'carrier'
            ]
        });
    }    async updateState(id, body) {
        const order = await this.findOne(id);
        if (body.state === "Cancelado") {
            const orderItems = await this.OrderItem.findAll({
                where: {
                    orderId: id
                }
            });
            for (let i = 0; i < orderItems.length; i++) {
                const product = await this.Product.findByPk(orderItems[i].productId);
                await product.update({
                    stock: product.stock + orderItems[i].quantity
                });
            }
        }

        return order.update(body);
    }

    async addItem(orderId, itemData) {
        // Verificar que el pedido exista
        const order = await this.Order.findByPk(orderId);
        if (!order) {
            throw boom.notFound('Order not found');
        }

        // Verificar que el pedido no esté cancelado o entregado
        if (order.state === 'Cancelado' || order.state === 'Entregado') {
            throw boom.badRequest(`Cannot add items to ${order.state.toLowerCase()} order`);
        }

        // Verificar que el producto exista y haya stock
        const product = await this.Product.findByPk(itemData.productId);
        if (!product) {
            throw boom.notFound('Product not found');
        }
        
        if (product.stock < itemData.quantity) {
            throw boom.badRequest('Product out of stock');
        }

        // Obtener el precio unitario del producto al momento de añadirlo
        const unitPrice = product.price;

        const newItemData = {
            orderId: orderId,
            productId: itemData.productId,
            quantity: itemData.quantity,
            unitPrice: unitPrice,
        };

        const newItem = await this.OrderItem.create(newItemData);

        // Actualizar stock del producto
        await product.update({ 
            stock: product.stock - itemData.quantity 
        });

        // Retornar el item creado con la información del producto
        return this.OrderItem.findByPk(newItem.id, {
            include: ['product']
        });
    }

    async delete(id) {
        //Eliminar order_items asociados y luego la orden
        const order = await this.findOne(id);
        await this.OrderItem.destroy({
            where: {
                orderId: id
            }
        });
        await order.destroy();
        return { id };
    }
}

module.exports = new OrderService(); // para que exista una sola instancia